import { t } from "@/i18n"; /**
 * Play the recording of a word: a web url, or one a dictionary file has
 * (`mdict:<id>:<path>`), read when played.
 */

type Resolver = (ref: string) => Promise<string | undefined>;

/** Who gives the url of a recording of a scheme, e.g. `mdict:`. */
const resolvers = new Map<string, Resolver>();

export function registerAudioResolver(scheme: string, resolve: Resolver) {
  resolvers.set(scheme, resolve);
}

/** A silent wav: started in the click, so a recording read after it may play. */
function silence(): string {
  const samples = 8;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

// one element for all: a web view lets an element play only from a click,
// and once it played, it may play again after a wait (the bytes of a file)
let player: HTMLAudioElement | null = null;

/** Why a recording could not be played, as said to the user. */
export class PlayError extends Error {}

/**
 * Play the element's source; rejects if it cannot (a format the web view
 * does not play, a file not found). A play cut by the next one is no error.
 */
const play = async (audio: HTMLAudioElement) => {
  try {
    // jsdom gives no promise
    await (audio.play() as Promise<void> | undefined);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "AbortError") return;
    console.warn("Failed to play the recording", e);
    throw new PlayError(
      name === "NotSupportedError"
        ? t(
            "This sound cannot be played: its format is not supported, or it was not found",
          )
        : name === "NotAllowedError"
          ? t("Playing sounds is not allowed here")
          : t("This sound cannot be played"),
    );
  }
};

/** Play a recording, from a click; rejects with a PlayError if it cannot be. */
export async function playRecording(ref: string): Promise<void> {
  player ??= typeof Audio === "undefined" ? null : new Audio();
  if (!player) return;
  if (/^(https?:|data:|blob:)/i.test(ref)) {
    player.src = ref;
    return play(player);
  }
  const scheme = ref.slice(0, ref.indexOf(":") + 1);
  const resolve = resolvers.get(scheme);
  if (!resolve) throw new PlayError("This sound cannot be played");
  player.src = silence();
  // started in the click (the silence), so the sound may play after the wait
  void play(player).catch(() => undefined);
  const url = await resolve(ref);
  if (!url) throw new PlayError("This sound is not in its dictionary file");
  player.src = url;
  return play(player);
}
