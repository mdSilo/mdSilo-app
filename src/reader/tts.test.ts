import type { Speech } from '@/speech/speech';
import { parseSSML, TTSController } from './tts';
import type { FoliateView, TTSApi } from './view';

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
    prev: () => { block = Math.max(0, block - 1); return sections[section][block]; },
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
