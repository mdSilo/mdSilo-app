import { invoke } from "@tauri-apps/api/core";
import { isWeb } from "@/workspace/util";
import { aiProviders, type AiProvider } from "./providers";

/**
 * Speech to text (docs/ai.md, "Audio and other services"): audio sent to the
 * `/audio/transcriptions` of an OpenAI-compatible provider (OpenAI, a local
 * Whisper server…), its segments with their times. Long MP3 is sent in parts
 * cut between its frames, the services taking 25 MB at most.
 */

export type Segment = { start: number; end: number; text: string };

/** the most bytes sent at once: under the 25 MB of OpenAI */
export const STT_MAX_BYTES = 24 * 1024 * 1024;

/** The provider of speech to text: the first with a model for it. */
export async function sttProvider(): Promise<AiProvider | undefined> {
  return (await aiProviders()).find(
    (p) => p.kind === "openai" && p.settings?.sttModel?.trim(),
  );
}

// # MP3, cut between its frames

const BITRATES: Record<string, number[]> = {
  // MPEG-1 layer III; MPEG-2/2.5 layer III, in kbit/s
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/** The length in bytes and in seconds of the MP3 frame at `i`, none if none there. */
function frameAt(
  b: Uint8Array,
  i: number,
): { size: number; seconds: number } | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0)
    return null;
  const version = (b[i + 1] >> 3) & 3; // 3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5
  const layer = (b[i + 1] >> 1) & 3; // 1: layer III
  const bitrateIndex = b[i + 2] >> 4;
  const rateIndex = (b[i + 2] >> 2) & 3;
  if (
    version === 1 ||
    layer !== 1 ||
    bitrateIndex === 0 ||
    bitrateIndex === 15 ||
    rateIndex === 3
  )
    return null;
  const bitrate = BITRATES[version === 3 ? "v1" : "v2"][bitrateIndex] * 1000;
  const rate = RATES[version][rateIndex];
  const padding = (b[i + 2] >> 1) & 1;
  const samples = version === 3 ? 1152 : 576;
  const size = Math.floor(((samples / 8) * bitrate) / rate) + padding;
  return size > 4 ? { size, seconds: samples / rate } : null;
}

/** Where the frames start: after an ID3v2 tag. */
function framesStart(b: Uint8Array): number {
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 && b.length > 10) {
    const size =
      ((b[6] & 0x7f) << 21) |
      ((b[7] & 0x7f) << 14) |
      ((b[8] & 0x7f) << 7) |
      (b[9] & 0x7f);
    return 10 + size + (b[5] & 0x10 ? 10 : 0);
  }
  return 0;
}

export type AudioPart = { bytes: Uint8Array; offset: number };

/**
 * The audio in parts of `max` bytes at most, each with the time it starts
 * at: MP3 cut between its frames; anything else whole, if small enough.
 */
export function audioParts(
  bytes: Uint8Array,
  max = STT_MAX_BYTES,
): AudioPart[] {
  if (bytes.length <= max) return [{ bytes, offset: 0 }];
  const start = framesStart(bytes);
  const parts: AudioPart[] = [];
  let partStart = start;
  let partOffset = 0;
  let seconds = 0;
  let i = start;
  let frames = 0;
  while (i < bytes.length) {
    const frame = frameAt(bytes, i);
    if (!frame) {
      // not a frame here: on to the next sync
      i++;
      continue;
    }
    frames++;
    if (i + frame.size - partStart > max && i > partStart) {
      parts.push({ bytes: bytes.subarray(partStart, i), offset: partOffset });
      partStart = i;
      partOffset = seconds;
    }
    seconds += frame.seconds;
    i += frame.size;
  }
  if (frames < 10)
    throw new Error(
      "The audio is too big to send at once (25 MB), and only MP3 can be cut in parts.",
    );
  if (partStart < bytes.length)
    parts.push({ bytes: bytes.subarray(partStart), offset: partOffset });
  return parts;
}

// # sending

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The segments of an answer of `/audio/transcriptions`: verbose JSON, else its text. */
export function segmentsOf(answer: any, offset = 0): Segment[] {
  const segments: any[] = Array.isArray(answer?.segments)
    ? answer.segments
    : [];
  if (segments.length)
    return segments
      .filter((s) => typeof s?.text === "string" && s.text.trim())
      .map((s) => ({
        start: offset + Number(s.start ?? 0),
        end: offset + Number(s.end ?? s.start ?? 0),
        text: s.text.trim(),
      }));
  const text = typeof answer?.text === "string" ? answer.text.trim() : "";
  return text ? [{ start: offset, end: offset, text }] : [];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function upload(
  provider: AiProvider,
  fields: Record<string, string>,
  file: { bytes: Uint8Array; name: string; type: string },
): Promise<unknown> {
  const path = "/audio/transcriptions";
  if (!isWeb) {
    const enc = encodeURIComponent;
    return invoke("ai_upload", file.bytes, {
      headers: {
        "x-provider": enc(provider.id),
        "x-path": enc(path),
        "x-fields": enc(JSON.stringify(fields)),
        "x-file-name": enc(file.name),
        "x-file-type": enc(file.type),
      },
    });
  }
  const { storedProvider } = await import("@/host/web/ai");
  const stored = await storedProvider(provider.id);
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append(
    "file",
    new Blob([file.bytes as BlobPart], { type: file.type }),
    file.name,
  );
  const response = await fetch(`${stored.baseUrl}${path}`, {
    method: "POST",
    headers: stored.key ? { authorization: `Bearer ${stored.key}` } : {},
    body: form,
  });
  if (!response.ok)
    throw new Error(
      `${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  return response.json();
}

/** One part sent: with its times (verbose JSON), else its text only, for a model without. */
async function transcribePart(
  provider: AiProvider,
  part: AudioPart,
  file: { name: string; type: string },
  language?: string,
): Promise<Segment[]> {
  const fields: Record<string, string> = {
    model: provider.settings.sttModel?.trim() ?? "",
    response_format: "verbose_json",
    ...(language ? { language } : {}),
  };
  const sent = { ...file, bytes: part.bytes };
  try {
    return segmentsOf(await upload(provider, fields, sent), part.offset);
  } catch (e) {
    if (
      !/\b400\b/.test(String(e)) ||
      !/response_format|verbose/i.test(String(e))
    )
      throw e;
    return segmentsOf(
      await upload(provider, { ...fields, response_format: "json" }, sent),
      part.offset,
    );
  }
}

/**
 * The text of the audio, as segments with their times; `onPart` told of each
 * part sent, for a long one.
 */
export async function transcribe(
  bytes: Uint8Array,
  file: { name: string; type: string },
  options: {
    language?: string;
    provider?: AiProvider;
    onPart?: (done: number, of: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Segment[]> {
  const provider = options.provider ?? (await sttProvider());
  if (!provider)
    throw new Error(
      "No provider for speech to text: set a model for it (e.g. whisper-1) in Settings > AI.",
    );
  const parts = audioParts(bytes);
  const segments: Segment[] = [];
  for (const [i, part] of parts.entries()) {
    if (options.signal?.aborted) break;
    options.onPart?.(i, parts.length);
    segments.push(
      ...(await transcribePart(provider, part, file, options.language)),
    );
  }
  options.onPart?.(parts.length, parts.length);
  return segments;
}
