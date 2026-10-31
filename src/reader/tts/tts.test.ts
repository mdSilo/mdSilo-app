import type { Speech } from '@/speech/speech';
import type { FoliateView, TTSApi } from '../view';
import { inView, parseSSML, TTSController } from './tts';

const ssml = (body: string) =>
  `<speak xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en">${body}</speak>`;

describe('parseSSML', () => {
  test('the sentences with their marks', () => {
    expect(parseSSML(ssml('<mark name="0"/>It was a bright  cold day. <mark name="1"/><emphasis>The clocks</emphasis> struck.'))).toEqual([
      { mark: '0', text: 'It was a bright cold day.' },
      { mark: '1', text: 'The clocks struck.' },
    ]);
    expect(parseSSML(ssml('No marks'))).toEqual([{ text: 'No marks' }]);
    expect(parseSSML(ssml('<mark name="0"/>  '))).toEqual([]);
  });
});

/** A section of blocks, read by a fake speech synthesis. */
function setup(sections: string[][]) {
  let section = 0;
  let block = -1;
  const marks: string[] = [];
  const spoken: string[] = [];
  const makeTts = (): TTSApi => ({
    doc: document,
    start: () => { block = 0; return sections[section][0]; },
    resume: () => sections[section][Math.max(block, 0)],
    next: () => { block += 1; return sections[section][block]; },
    // as foliate's: nothing before the first block
    prev: () => (block <= 0 ? undefined : sections[section][--block]),
    from: () => { block = 0; return sections[section][0]; },
    setMark: (mark) => { marks.push(`${section}:${mark}`); },
  });
  const renderer = {
    primaryIndex: 0,
    nextSection: vi.fn(async () => {
      if (section < sections.length - 1) {
        section += 1;
        renderer.primaryIndex = section;
      }
    }),
    getContents: () => [],
    scrollToAnchor: vi.fn(),
  };
  const view = {
    tts: undefined as TTSApi | undefined,
    renderer,
    language: { canonical: 'en' },
    lastLocation: {},
    initTTS: vi.fn(async () => { view.tts = makeTts(); }),
    next: vi.fn(),
  };
  const speech: Speech = {
    speak: vi.fn(async (text: string) => { spoken.push(text); return 'end' as const; }),
    cancel: vi.fn(),
    voices: async () => [],
    prepare: vi.fn(),
  };
  const statuses: string[] = [];
  const errors: string[] = [];
  let current: Speech | undefined = speech;
  const tts = new TTSController(
    view as unknown as FoliateView,
    () => current,
    () => ({ rate: 1.5 }),
    (s) => statuses.push(s),
    (e) => errors.push(e),
  );
  const choose = (other?: Speech) => { current = other; };
  return { tts, spoken, marks, statuses, errors, speech, view, choose };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('TTSController', () => {
  test('reads the blocks, then the next sections, to the end', async () => {
    const { tts, spoken, marks, statuses, speech } = setup([
      [ssml('<mark name="0"/>One. <mark name="1"/>Two.'), ssml('<mark name="2"/>Three.')],
      [ssml('<mark name="0"/>Four.')],
    ]);
    await tts.start();
    for (let i = 0; i < 10; i++) await settle();
    expect(spoken).toEqual(['One.', 'Two.', 'Three.', 'Four.']);
    expect(marks).toEqual(['0:0', '0:1', '0:2', '1:0']);
    expect(vi.mocked(speech.speak).mock.calls[0][1]).toEqual({ lang: 'en', voice: undefined, rate: 1.5 });
    expect(statuses.at(-1)).toBe('idle');
  });

  test('pauses, resumes and stops', async () => {
    const { tts, spoken, statuses, speech } = setup([[ssml('<mark name="0"/>One. <mark name="1"/>Two.')]]);
    // the speech ends only when canceled
    let cancel: (v: 'cancel') => void = () => undefined;
    vi.mocked(speech.speak).mockImplementation((text: string) => {
      spoken.push(text);
      return new Promise((resolve) => { cancel = resolve; });
    });
    vi.mocked(speech.cancel).mockImplementation(() => cancel('cancel'));
    await tts.start();
    await settle();
    expect(spoken).toEqual(['One.']);
    tts.pause();
    expect(statuses.at(-1)).toBe('paused');
    await tts.resume();
    await settle();
    expect(spoken).toEqual(['One.', 'One.']);
    expect(statuses.at(-1)).toBe('playing');
    tts.stop();
    expect(statuses.at(-1)).toBe('idle');
  });

  test('next clicked twice at once: one block further, read once', async () => {
    const { tts, spoken, speech } = setup([[
      ssml('<mark name="0"/>One.'), ssml('<mark name="1"/>Two.'), ssml('<mark name="2"/>Three.'),
    ]]);
    // the speech ends only when canceled
    let cancel: (v: 'cancel') => void = () => undefined;
    vi.mocked(speech.speak).mockImplementation((text: string) => {
      spoken.push(text);
      return new Promise((resolve) => { cancel = resolve; });
    });
    vi.mocked(speech.cancel).mockImplementation(() => cancel('cancel'));
    await tts.start();
    await settle();
    await Promise.all([tts.skip(true), tts.skip(true)]);
    for (let i = 0; i < 10; i++) await settle();
    // the first click gave way: not Two and Three at once, by two loops
    expect(spoken).toEqual(['One.', 'Two.']);
  });

  test('back from the first block: it again, not the second', async () => {
    const { tts, spoken, speech } = setup([[ssml('<mark name="0"/>One.'), ssml('<mark name="1"/>Two.')]]);
    let cancel: (v: 'cancel') => void = () => undefined;
    vi.mocked(speech.speak).mockImplementation((text: string) => {
      spoken.push(text);
      return new Promise((resolve) => { cancel = resolve; });
    });
    vi.mocked(speech.cancel).mockImplementation(() => cancel('cancel'));
    await tts.start();
    await settle();
    await tts.skip(false);
    await settle();
    expect(spoken).toEqual(['One.', 'One.']);
  });

  test('makes the next sentences ahead', async () => {
    const { tts, speech } = setup([[ssml('<mark name="0"/>One. <mark name="1"/>Two. <mark name="2"/>Three. <mark name="3"/>Four.')]]);
    await tts.start();
    for (let i = 0; i < 10; i++) await settle();
    const options = { lang: 'en', voice: undefined, rate: 1.5 };
    expect(vi.mocked(speech.prepare!).mock.calls.slice(0, 2)).toEqual([['Two.', options], ['Three.', options]]);
    expect(vi.mocked(speech.prepare!).mock.calls.map(([text]) => text)).toEqual(['Two.', 'Three.', 'Three.', 'Four.', 'Four.']);
  });

  test('stops with the error of the speech', async () => {
    const { tts, spoken, statuses, errors, speech } = setup([[ssml('<mark name="0"/>One. <mark name="1"/>Two.')]]);
    vi.mocked(speech.speak).mockRejectedValueOnce(new Error('No voice'));
    await tts.start();
    for (let i = 0; i < 10; i++) await settle();
    expect(errors).toEqual(['No voice']);
    expect(spoken).toEqual([]);
    expect(statuses.at(-1)).toBe('idle');
  });

  test('no engine: stops, says so', async () => {
    const { tts, errors, statuses, choose } = setup([[ssml('<mark name="0"/>One.')]]);
    choose(undefined);
    await tts.start();
    for (let i = 0; i < 10; i++) await settle();
    expect(errors).toEqual(['No speech engine to read aloud']);
    expect(statuses.at(-1)).toBe('idle');
  });

  test('another engine chosen while reading: the one speaking is canceled', async () => {
    const { tts, speech, choose, spoken } = setup([[ssml('<mark name="0"/>One. <mark name="1"/>Two.')]]);
    let cancel: (v: 'cancel') => void = () => undefined;
    vi.mocked(speech.speak).mockImplementation(() => new Promise((resolve) => { cancel = resolve; }));
    vi.mocked(speech.cancel).mockImplementation(() => cancel('cancel'));
    const other: Speech = {
      speak: vi.fn(async (text: string) => { spoken.push(`other ${text}`); return 'end' as const; }),
      cancel: vi.fn(),
      voices: async () => [],
    };
    await tts.start();
    await settle();
    choose(other);
    tts.pause();
    expect(speech.cancel).toHaveBeenCalled();
    expect(other.cancel).not.toHaveBeenCalled();
    await tts.resume();
    for (let i = 0; i < 10; i++) await settle();
    expect(spoken).toEqual(['other One.', 'other Two.']);
  });
});

describe('inView', () => {
  const rect = (left: number, top: number, width = 100, height = 20) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
  /** a range at (x, y) of a frame at (fx, fy), the renderer at 0,0 800x600 */
  function place(x: number, y: number, fx = 0, fy = 0) {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.body.textContent = 'text';
    Object.defineProperty(frame, 'offsetWidth', { value: 800, configurable: true });
    frame.getBoundingClientRect = () => rect(fx, fy, 800, 600);
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    range.getClientRects = () => [rect(x, y)] as unknown as DOMRectList;
    const renderer = document.createElement('div');
    renderer.getBoundingClientRect = () => rect(0, 0, 800, 600);
    return { range, renderer, frame };
  }
  test('shown or not', () => {
    const shown = place(100, 100);
    expect(inView(shown.range, shown.renderer)).toBe(true);
    // the next page: the frame scrolled left of it
    const next = place(900, 100);
    expect(inView(next.range, next.renderer)).toBe(false);
    const scrolledTo = place(900, 100, -800);
    expect(inView(scrolledTo.range, scrolledTo.renderer)).toBe(true);
    // below, scrolled mode
    const below = place(100, 700);
    expect(inView(below.range, below.renderer)).toBe(false);
    expect(inView(shown.range, undefined)).toBe(false);
  });
});
