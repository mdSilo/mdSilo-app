import { create } from 'zustand';
import type { FoliateView, TTSApi } from './view';

/**
 * Read a book aloud: foliate-js splits the text into blocks, as SSML with a
 * mark before each sentence; the speech synthesis of the system (Web Speech
 * API) reads them one by one, the sentence read highlighted.
 */

export type Segment = { mark?: string; text: string };

/** The sentences of a block of SSML, with their marks. */
export function parseSSML(ssml: string): Segment[] {
  const doc = new DOMParser().parseFromString(ssml, 'application/xml');
  const segments: Segment[] = [];
  let current: Segment = { text: '' };
  const push = () => {
    if (current.text.trim()) segments.push({ ...current, text: current.text.replace(/\s+/g, ' ').trim() });
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
        current.text += child.textContent ?? '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if ((child as Element).localName === 'mark') {
          push();
          current = { mark: (child as Element).getAttribute('name') ?? undefined, text: '' };
        } else {
          walk(child);
        }
      }
    }
  };
  if (doc.documentElement) walk(doc.documentElement);
  push();
  return segments;
}

/** What the speech synthesis of the system offers, see SpeechSynthesis. */
export type Speech = {
  speak: (text: string, options: { lang?: string; voice?: string; rate: number }) => Promise<'end' | 'cancel'>;
  cancel: () => void;
  voices: () => { name: string; lang: string }[];
};

/** The Web Speech API, if any. */
export function webSpeech(): Speech | undefined {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
  return {
    speak: (text, { lang, voice, rate }) => new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (lang) utterance.lang = lang;
      const voices = synth.getVoices();
      const chosen = voices.find((v) => v.name === voice)
        ?? (lang ? voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase())) : undefined);
      if (chosen) utterance.voice = chosen;
      utterance.rate = rate;
      utterance.onend = () => resolve('end');
      utterance.onerror = (e) => resolve(e.error === 'interrupted' || e.error === 'canceled' ? 'cancel' : 'end');
      synth.speak(utterance);
    }),
    cancel: () => synth.cancel(),
    voices: () => synth.getVoices().map((v) => ({ name: v.name, lang: v.lang })),
  };
}

export type TTSStatus = 'idle' | 'playing' | 'paused';

type TTSStore = { status: TTSStatus; setStatus: (status: TTSStatus) => void };

export const useTTS = create<TTSStore>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));

const HIGHLIGHT = 'mdsilo-tts';

/** Highlight the sentence read (CSS Custom Highlight API, where supported). */
function highlight(range: Range | undefined) {
  const win = range?.startContainer.ownerDocument?.defaultView as
    | (Window & { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (r: Range) => unknown })
    | undefined;
  if (!range || !win?.CSS?.highlights || !win.Highlight) return;
  win.CSS.highlights.set(HIGHLIGHT, new win.Highlight(range));
}

function clearHighlight(view: FoliateView | null) {
  for (const { doc } of view?.renderer?.getContents?.() ?? []) {
    (doc.defaultView as Window & { CSS?: { highlights?: Map<string, unknown> } })?.CSS?.highlights?.delete(HIGHLIGHT);
  }
}

/** The CSS of the sentence read, in the pages of the book. */
export const ttsStyles = (color: string) =>
  `::highlight(${HIGHLIGHT}) { background-color: color-mix(in srgb, ${color} 35%, transparent); }`;

export type TTSOptions = { voice?: string; rate: number };

/**
 * Reads the book from a place, sentence by sentence, on to the next sections
 * until the end or stopped.
 */
export class TTSController {
  private segments: Segment[] = [];
  private run = 0;

  constructor(
    private view: FoliateView,
    private speech: Speech,
    private options: () => TTSOptions,
    private onStatus: (status: TTSStatus) => void = (s) => useTTS.getState().setStatus(s),
  ) {}

  private async tts(): Promise<TTSApi | undefined> {
    await this.view.initTTS('sentence', undefined, (range: Range) => {
      highlight(range);
      this.view.renderer.scrollToAnchor?.(range, true);
    });
    return this.view.tts ?? undefined;
  }

  /** Read from the range (e.g. the text selected), or the page shown. */
  async start(from?: Range) {
    this.stop();
    const tts = await this.tts();
    if (!tts) return;
    const range = from ?? (this.view.lastLocation as { range?: Range } | undefined)?.range;
    const ssml = range ? tts.from(range) : tts.start();
    this.segments = ssml ? parseSSML(ssml) : [];
    void this.loop();
  }

  pause() {
    this.run += 1;
    this.speech.cancel();
    this.onStatus('paused');
  }

  async resume() {
    const tts = await this.tts();
    const ssml = tts?.resume();
    this.segments = ssml ? parseSSML(ssml) : [];
    void this.loop();
  }

  stop() {
    this.run += 1;
    this.segments = [];
    this.speech.cancel();
    clearHighlight(this.view);
    this.onStatus('idle');
  }

  /** The next or previous block. */
  async skip(forward: boolean) {
    this.run += 1;
    this.speech.cancel();
    const tts = await this.tts();
    const ssml = forward ? tts?.next() : tts?.prev();
    this.segments = ssml ? parseSSML(ssml) : [];
    void this.loop();
  }

  private async loop() {
    const run = ++this.run;
    this.onStatus('playing');
    const lang = this.view.language?.canonical;
    while (run === this.run) {
      if (this.segments.length === 0) {
        const tts = this.view.tts;
        const ssml = tts?.next();
        if (ssml) {
          this.segments = parseSSML(ssml);
          continue;
        }
        // the end of the section: on to the next one
        if (!(await this.nextSection())) break;
        if (run !== this.run) return;
        const next = await this.tts();
        const first = next?.start();
        this.segments = first ? parseSSML(first) : [];
        if (this.segments.length === 0 && !first) break;
        continue;
      }
      const segment = this.segments.shift()!;
      if (segment.mark) this.view.tts?.setMark(segment.mark);
      const { voice, rate } = this.options();
      const ended = await this.speech.speak(segment.text, { lang, voice, rate });
      if (ended === 'cancel' || run !== this.run) return;
    }
    if (run === this.run) this.stop();
  }

  private async nextSection(): Promise<boolean> {
    const renderer = this.view.renderer as { nextSection?: () => Promise<void>; primaryIndex: number };
    const before = renderer.primaryIndex;
    if (renderer.nextSection) await renderer.nextSection();
    else await this.view.next();
    return renderer.primaryIndex !== before;
  }
}

let controller: { view: FoliateView; tts: TTSController } | undefined;

/** The reader aloud of the book view, if speech synthesis is available. */
export function ttsOf(view: FoliateView | null, options: () => TTSOptions): TTSController | undefined {
  if (!view) return undefined;
  if (controller?.view === view) return controller.tts;
  controller?.tts.stop();
  const speech = webSpeech();
  if (!speech) return undefined;
  controller = { view, tts: new TTSController(view, speech, options) };
  return controller.tts;
}

/** Stop reading aloud, e.g. the book closed. */
export function stopTTS() {
  controller?.tts.stop();
  controller = undefined;
}
