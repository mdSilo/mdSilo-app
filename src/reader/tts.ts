import { create } from 'zustand';
import type { Speech } from '@/speech/speech';
import type { FoliateView, TTSApi } from './view';

/**
 * Read a book aloud: foliate-js splits the text into blocks, as SSML with a
 * mark before each sentence; a speech engine (src/speech) reads them one by
 * one, the sentence read highlighted.
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

export type TTSStatus = 'idle' | 'playing' | 'paused';

type TTSStore = {
  status: TTSStatus;
  /** a book read aloud, its controls in the player, even stopped; until closed */
  active: boolean;
  /** why the reading stopped, if it failed */
  error?: string;
  setStatus: (status: TTSStatus) => void;
  setError: (error?: string) => void;
};

export const useTTS = create<TTSStore>((set) => ({
  status: 'idle',
  active: false,
  setStatus: (status) => set(status === 'playing' ? { status, active: true, error: undefined } : { status }),
  setError: (error) => set({ error }),
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

/**
 * The start of the range is in the view: its frame's place plus its own,
 * within the renderer (the pages shown, or the part scrolled to).
 */
export function inView(range: Range, renderer: Element | undefined): boolean {
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement as HTMLElement | null | undefined;
  const rect = Array.from(range.getClientRects()).find((r) => r.width > 0 && r.height > 0);
  if (!frame || !rect || !renderer?.getBoundingClientRect) return false;
  const f = frame.getBoundingClientRect();
  // a fixed layout page is scaled
  const scale = frame.offsetWidth ? f.width / frame.offsetWidth : 1;
  const x = f.left + rect.left * scale;
  const y = f.top + rect.top * scale;
  const view = renderer.getBoundingClientRect();
  return x >= view.left && x < view.right && y >= view.top && y < view.bottom;
}

/** The CSS of the sentence read, in the pages of the book. */
export const ttsStyles = (color: string) =>
  `::highlight(${HIGHLIGHT}) { background-color: color-mix(in srgb, ${color} 35%, transparent); }`;

export type TTSOptions = { voice?: string; rate: number };

/** the sentences made ahead by an engine making audio */
const AHEAD = 2;

/**
 * Reads the book from a place, sentence by sentence, on to the next sections
 * until the end or stopped.
 */
export class TTSController {
  private segments: Segment[] = [];
  private run = 0;
  /** the speech speaking, canceled even if another one is chosen meanwhile */
  private speaking?: Speech;

  /** `speech`: the engine to read the next sentence, the one chosen then */
  constructor(
    private view: FoliateView,
    private speech: () => Speech | undefined,
    private options: () => TTSOptions,
    private onStatus: (status: TTSStatus) => void = (s) => useTTS.getState().setStatus(s),
    private onError: (error: string) => void = (e) => useTTS.getState().setError(e),
  ) {}

  private cancel() {
    this.speaking?.cancel();
    this.speaking = undefined;
  }

  private async tts(): Promise<TTSApi | undefined> {
    await this.view.initTTS('sentence', undefined, (range: Range) => {
      highlight(range);
      // to the sentence only if not shown: scrolled to each one, the
      // scrolled mode jumped by every sentence; not as a selection (`true`),
      // which selected the sentence in the page
      if (!inView(range, this.view.renderer as unknown as Element)) {
        void this.view.renderer.scrollToAnchor?.(range);
      }
    });
    return this.view.tts ?? undefined;
  }

  /** Read from the range (e.g. the text selected), or the page shown. */
  async start(from?: Range) {
    this.stop();
    const run = this.run;
    const tts = await this.tts();
    // started, skipped, stopped again meanwhile: that one goes on
    if (!tts || run !== this.run) return;
    const range = from ?? (this.view.lastLocation as { range?: Range } | undefined)?.range;
    const ssml = range ? tts.from(range) : tts.start();
    this.segments = ssml ? parseSSML(ssml) : [];
    void this.loop();
  }

  pause() {
    this.run += 1;
    this.cancel();
    this.onStatus('paused');
  }

  async resume() {
    const run = ++this.run;
    this.cancel();
    const tts = await this.tts();
    if (run !== this.run) return;
    const ssml = tts?.resume();
    this.segments = ssml ? parseSSML(ssml) : [];
    void this.loop();
  }

  stop() {
    this.run += 1;
    this.segments = [];
    this.cancel();
    clearHighlight(this.view);
    this.onStatus('idle');
  }

  /** The next or previous block. */
  async skip(forward: boolean) {
    const run = ++this.run;
    this.cancel();
    const tts = await this.tts();
    // clicked again meanwhile: the last click goes on, not two at once
    if (run !== this.run) return;
    // back from the first block: it again, not on to the second
    const ssml = forward ? tts?.next() : (tts?.prev() ?? tts?.start());
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
      const speech = this.speech();
      if (!speech) {
        this.onError('No speech engine to read aloud');
        break;
      }
      const { voice, rate } = this.options();
      const options = { lang, voice, rate };
      for (const next of this.segments.slice(0, AHEAD)) speech.prepare?.(next.text, options);
      this.speaking = speech;
      let ended: 'end' | 'cancel';
      try {
        ended = await speech.speak(segment.text, options);
      } catch (e) {
        if (run !== this.run) return;
        this.onError(e instanceof Error ? e.message : String(e));
        break;
      }
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

/** The reader aloud of the book view, by the speech chosen for each sentence. */
export function ttsOf(
  view: FoliateView | null,
  speech: () => Speech | undefined,
  options: () => TTSOptions,
): TTSController | undefined {
  if (!view) return undefined;
  if (controller?.view === view) return controller.tts;
  controller?.tts.stop();
  controller = { view, tts: new TTSController(view, speech, options) };
  return controller.tts;
}

/** The view read aloud, if any. */
export const ttsView = () => controller?.view;

/** Stop reading aloud, e.g. the book closed. */
export function stopTTS() {
  controller?.tts.stop();
  controller = undefined;
  useTTS.setState({ active: false, error: undefined });
}
