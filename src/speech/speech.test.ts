import { invoke } from '@tauri-apps/api/core';
import { mockInvoke, enterTauri, leaveTauri } from '@/testUtils';
import { audioSpeech, engineOf, liveSpeech, voicesOf, webSpeech, type Engine } from './speech';

const engine = (id: string, available = true, kind: Engine['kind'] = 'audio'): Engine => ({
  id, name: id, kind, online: false, fields: [], available, config: {},
});

describe('engineOf', () => {
  test('the one chosen if it can be used, else the system, else the browser', () => {
    const engines = [engine('system', true, 'live'), engine('azure', false), engine('piper'), engine('web', true, 'web')];
    expect(engineOf(engines, 'piper')?.id).toBe('piper');
    expect(engineOf(engines, 'azure')?.id).toBe('system');
    expect(engineOf(engines, '')?.id).toBe('system');
    expect(engineOf([engine('system', false), engine('web', true, 'web')])?.id).toBe('web');
    expect(engineOf([engine('web', false, 'web')])).toBeUndefined();
  });
});

test('voicesOf: of the language, and those of any', () => {
  const voices = [{ id: 'a', name: 'a', lang: 'en-US' }, { id: 'b', name: 'b', lang: 'zh-CN' }, { id: 'c', name: 'c', lang: '' }];
  expect(voicesOf(voices, 'zh').map((v) => v.id)).toEqual(['b', 'c']);
  expect(voicesOf(voices).length).toBe(3);
});

test('liveSpeech: speaks and stops in Rust', async () => {
  mockInvoke(invoke, { tts_speak: 'end', tts_voices: [{ id: 'v', name: 'V', lang: 'en' }] });
  const speech = liveSpeech('system');
  await expect(speech.speak('Hi.', { lang: 'en', voice: 'v', rate: 1.5 })).resolves.toBe('end');
  expect(invoke).toHaveBeenCalledWith('tts_speak', { engine: 'system', text: 'Hi.', options: { lang: 'en', voice: 'v', rate: 1.5 } });
  await expect(speech.voices()).resolves.toEqual([{ id: 'v', name: 'V', lang: 'en' }]);
  speech.cancel();
  expect(invoke).toHaveBeenCalledWith('tts_stop');
});

/** An audio element: plays until ended or paused. */
function fakeAudio() {
  const audio = {
    src: '',
    playbackRate: 1,
    onended: null as null | (() => void),
    onerror: null as null | (() => void),
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  };
  return audio;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('audioSpeech', () => {
  test('plays the audio made, at the rate; made once, ahead', async () => {
    let made = 0;
    mockInvoke(invoke, { tts_audio: ({ text }: { text: string }) => { made += 1; return `/cache/${text}.mp3`; } });
    const audio = fakeAudio();
    const speech = audioSpeech('azure', audio as unknown as HTMLAudioElement);
    const options = { lang: 'en', voice: 'Jenny', rate: 1.25 };
    speech.prepare!('Two.', options);
    const one = speech.speak('One.', options);
    await settle();
    expect(audio.src).toBe(`asset://localhost/${encodeURIComponent('/cache/One..mp3')}`);
    expect(audio.playbackRate).toBe(1.25);
    audio.onended!();
    await expect(one).resolves.toBe('end');
    const two = speech.speak('Two.', options);
    await settle();
    expect(made).toBe(2);
    expect(audio.src).toContain(encodeURIComponent('/cache/Two..mp3'));
    speech.cancel();
    await expect(two).resolves.toBe('cancel');
    expect(audio.pause).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('tts_audio', { engine: 'azure', text: 'One.', options });
  });

  test('canceled before the audio is made: not played', async () => {
    let resolve: (path: string) => void = () => undefined;
    mockInvoke(invoke, { tts_audio: () => new Promise((r) => { resolve = r; }) });
    const audio = fakeAudio();
    const speech = audioSpeech('piper', audio as unknown as HTMLAudioElement);
    const spoken = speech.speak('One.', { rate: 1 });
    speech.cancel();
    await expect(spoken).resolves.toBe('cancel');
    resolve('/cache/a.wav');
    await settle();
    expect(audio.play).not.toHaveBeenCalled();
  });

  test('the error of the engine, made again next time', async () => {
    let calls = 0;
    mockInvoke(invoke, { tts_audio: () => { calls += 1; return Promise.reject('401: no key'); } });
    const speech = audioSpeech('openai', fakeAudio() as unknown as HTMLAudioElement);
    await expect(speech.speak('One.', { rate: 1 })).rejects.toThrow('401: no key');
    await settle();
    await expect(speech.speak('One.', { rate: 1 })).rejects.toThrow('401: no key');
    expect(calls).toBe(2);
  });
});

describe('webSpeech', () => {
  const synth = { speak: vi.fn(), cancel: vi.fn(), getVoices: vi.fn(() => [] as { name: string; lang: string }[]) };
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', class { onstart?: () => void; onend?: () => void; constructor(public text: string) {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('a speech that never starts: an error, not a wait for ever', async () => {
    vi.useFakeTimers();
    const spoken = webSpeech()!.speak('Hi.', { rate: 1 });
    vi.advanceTimersByTime(5000);
    await expect(spoken).rejects.toThrow('does not answer');
    expect(synth.cancel).toHaveBeenCalled();
  });

  test('started, it ends', async () => {
    synth.speak.mockImplementation((u: { onstart: () => void; onend: () => void }) => { u.onstart(); u.onend(); });
    await expect(webSpeech()!.speak('Hi.', { rate: 1 })).resolves.toBe('end');
  });
});

describe('useEngines', () => {
  beforeEach(() => enterTauri());
  afterEach(() => {
    leaveTauri();
    vi.unstubAllGlobals();
  });

  test('the engines of Rust, the browser without voices not usable', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { useEngines } = await import('./speech');
    mockInvoke(invoke, { tts_engines: [engine('system', true, 'live')] });
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    vi.useFakeTimers();
    const loaded = useEngines.getState().load();
    await vi.advanceTimersByTimeAsync(2000);
    await loaded;
    vi.useRealTimers();
    expect(useEngines.getState().engines.map((e) => [e.id, e.available])).toEqual([['system', true], ['web', false]]);
  });
});
