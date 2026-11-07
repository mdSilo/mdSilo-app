/**
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

const play = (audio: HTMLAudioElement) => {
  // jsdom gives no promise; a load cut by the next one rejects
  (audio.play() as Promise<void> | undefined)?.catch((e) => {
    if ((e as Error)?.name !== "AbortError")
      console.warn("Failed to play the recording", e);
  });
};

/** Play a recording, from a click. */
export async function playRecording(ref: string): Promise<void> {
  player ??= typeof Audio === "undefined" ? null : new Audio();
  if (!player) return;
  if (/^(https?:|data:|blob:)/i.test(ref)) {
    player.src = ref;
    play(player);
    return;
  }
  const scheme = ref.slice(0, ref.indexOf(":") + 1);
  const resolve = resolvers.get(scheme);
  if (!resolve) return;
  player.src = silence();
  play(player);
  const url = await resolve(ref);
  if (!url) return;
  player.src = url;
  play(player);
}
