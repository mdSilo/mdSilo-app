import { create } from 'zustand';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/workspace/util';

/**
 * The speech engines to read aloud, one interface for all, see
 * src-tauri/src/tts: the system's (speech-dispatcher, `say`, System.Speech),
 * Piper, online services with the user's key, and the Web Speech API of the
 * webview, the last resort.
 *
 * A `live` engine speaks itself; an `audio` one makes the audio of a sentence,
 * played here, faster or slower, the next sentences made while one is read.
 */

export type Voice = { id: string; name: string; lang: string };

export type SpeakOptions = { lang?: string; voice?: string; rate: number };

export type Speech = {
  /** 'end' once spoken, 'cancel' if canceled; rejects if it cannot speak */
  speak: (text: string, options: SpeakOptions) => Promise<'end' | 'cancel'>;
  cancel: () => void;
  voices: () => Promise<Voice[]>;
  /** to be spoken soon: made ahead */
  prepare?: (text: string, options: SpeakOptions) => void;
};

export type EngineField = { name: string; label: string; secret: boolean; placeholder: string };

export type Engine = {
  id: string;
  name: string;
  kind: 'live' | 'audio' | 'web';
  /** the text read is sent to a service */
  online: boolean;
  fields: EngineField[];
  available: boolean;
  /** the settings given; the secret ones as '' */
  config: Record<string, string>;
};

/** a speech that did not start by then does not work */
const START_TIMEOUT = 5000;

/** The voices of the Web Speech API, once loaded: some browsers load them later. */
export function webVoices(wait = 2000): Promise<SpeechSynthesisVoice[]> {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve([]);
  const voices = synth.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', done);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, wait);
    synth.addEventListener?.('voiceschanged', done);
  });
}

/** The Web Speech API, if any. */
export function webSpeech(): Speech | undefined {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
  return {
    speak: (text, { lang, voice, rate }) => new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (lang) utterance.lang = lang;
      const voices = synth.getVoices();
      const chosen = voices.find((v) => v.name === voice)
        ?? (lang ? voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase())) : undefined);
      if (chosen) utterance.voice = chosen;
      utterance.rate = rate;
      // e.g. a webview with the API and no voice: nothing happens, nor ends
      const timer = setTimeout(() => {
        synth.cancel();
        reject(new Error('The speech of the browser does not answer'));
      }, START_TIMEOUT);
      utterance.onstart = () => clearTimeout(timer);
      utterance.onend = () => { clearTimeout(timer); resolve('end'); };
      utterance.onerror = (e) => {
        clearTimeout(timer);
        resolve(e.error === 'interrupted' || e.error === 'canceled' ? 'cancel' : 'end');
      };
      synth.speak(utterance);
    }),
    cancel: () => synth.cancel(),
    voices: async () => (await webVoices()).map((v) => ({ id: v.name, name: v.name, lang: v.lang })),
  };
}

const optionsOf = ({ lang, voice, rate }: SpeakOptions) => ({ lang, voice, rate });

/** An engine speaking by itself, in Rust. */
export function liveSpeech(engine: string): Speech {
  return {
    speak: (text, options) =>
      invoke<'end' | 'cancel'>('tts_speak', { engine, text, options: optionsOf(options) }),
    cancel: () => void invoke('tts_stop'),
    voices: () => invoke<Voice[]>('tts_voices', { engine }),
  };
}

/** made ahead at most, the older forgotten */
const MADE_AHEAD = 8;

/** An engine making audio, in Rust, played here. */
export function audioSpeech(engine: string, audio: HTMLAudioElement = new Audio()): Speech {
  // the audio files being made, by voice and text
  const made = new Map<string, Promise<string>>();
  const fileOf = (text: string, options: SpeakOptions) => {
    const key = `${options.voice ?? ''}\n${options.lang ?? ''}\n${text}`;
    let file = made.get(key);
    if (!file) {
      file = invoke<string>('tts_audio', { engine, text, options: optionsOf(options) });
      file.catch(() => made.delete(key));
      made.set(key, file);
      for (const old of made.keys()) {
        if (made.size <= MADE_AHEAD) break;
        made.delete(old);
      }
    }
    return file;
  };
  let canceled: (() => void) | undefined;
  return {
    speak: (text, options) => new Promise((resolve, reject) => {
      canceled?.();
      let done = false;
      const finish = (result: 'end' | 'cancel') => {
        if (done) return;
        done = true;
        audio.onended = null;
        audio.onerror = null;
        canceled = undefined;
        resolve(result);
      };
      canceled = () => finish('cancel');
      fileOf(text, options).then(async (file) => {
        if (done) return;
        audio.onended = () => finish('end');
        audio.onerror = () => {
          if (done) return;
          done = true;
          canceled = undefined;
          reject(new Error('The audio cannot be played'));
        };
        audio.src = convertFileSrc(file);
        audio.playbackRate = options.rate;
        await audio.play();
      }).catch((e: unknown) => {
        if (done) return;
        done = true;
        canceled = undefined;
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    }),
    cancel: () => {
      audio.pause();
      canceled?.();
    },
    voices: () => invoke<Voice[]>('tts_voices', { engine }),
    prepare: (text, options) => void fileOf(text, options).catch(() => undefined),
  };
}

export const WEB_ENGINE: Omit<Engine, 'available'> = {
  id: 'web', name: 'Browser (Web Speech)', kind: 'web', online: false, fields: [], config: {},
};

type EnginesStore = {
  engines: Engine[];
  loaded: boolean;
  load: () => Promise<void>;
};

/** The engines, whether each can be used: loaded once, again after a change of their settings. */
export const useEngines = create<EnginesStore>((set) => ({
  engines: [],
  loaded: false,
  load: async () => {
    const [native, voices] = await Promise.all([
      isTauri ? invoke<Engine[]>('tts_engines').catch(() => []) : Promise.resolve([]),
      webVoices(),
    ]);
    set({ engines: [...native, { ...WEB_ENGINE, available: voices.length > 0 }], loaded: true });
  },
}));

/** The engine chosen, if it can be used, else the system's, else the browser's. */
export function engineOf(engines: Engine[], chosen?: string): Engine | undefined {
  const usable = engines.filter((e) => e.available);
  return usable.find((e) => e.id === chosen)
    ?? usable.find((e) => e.id === 'system')
    ?? usable.find((e) => e.id === 'web');
}

const speeches = new Map<string, Speech>();

/** The speech of an engine, one for each. */
export function speechOf(engine: Engine): Speech | undefined {
  let speech = speeches.get(engine.id);
  if (!speech) {
    speech = engine.kind === 'web' ? webSpeech()
      : engine.kind === 'live' ? liveSpeech(engine.id)
        : audioSpeech(engine.id);
    if (speech) speeches.set(engine.id, speech);
  }
  return speech;
}

/** Change settings of an engine (an empty value forgets it), then see again which can be used. */
export async function configureEngine(engine: string, config: Record<string, string>) {
  await invoke('tts_configure', { engine, config });
  speeches.delete(engine);
  await useEngines.getState().load();
}

/** The voices of a language, and those of no language (they speak any). */
export const voicesOf = (voices: Voice[], lang?: string) =>
  lang ? voices.filter((v) => !v.lang || v.lang.toLowerCase().startsWith(lang.toLowerCase())) : voices;
