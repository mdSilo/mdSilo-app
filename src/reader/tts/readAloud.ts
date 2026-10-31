import { store } from '@/state/store';
import { engineOf, speechOf, useEngines } from '@/speech/speech';
import { onPauseRequest, playing } from '@/player/playerStore';
import { withDefaults } from '../settings';
import { getView, type FoliateView, type Pane } from '../view';
import { ttsOf, ttsView, useTTS } from './tts';

/** The engine to read aloud: the one chosen if it can be used, else the system's, else the browser's. */
export const ttsEngine = () =>
  engineOf(useEngines.getState().engines, withDefaults(store.getState().readerSettings).ttsEngine);

export const ttsOptions = () => {
  const settings = withDefaults(store.getState().readerSettings);
  const engine = ttsEngine();
  return { voice: (engine && settings.ttsVoices[engine.id]) || undefined, rate: settings.ttsRate };
};

const ttsSpeech = () => {
  const engine = ttsEngine();
  return engine ? speechOf(engine) : undefined;
};

/** The reader aloud of a book view. */
export const readerAloud = (view: FoliateView | null) => ttsOf(view, ttsSpeech, ttsOptions);

/** Read the book aloud from a range, or the page shown: of the book last used, or of a pane. */
export function readAloud(from?: Range, pane?: Pane) {
  return readerAloud(getView(pane))?.start(from);
}

const hasEngine = (state: ReturnType<typeof useEngines.getState>) => state.engines.some((e) => e.available);

/** An engine is there to read aloud. */
export const canReadAloud = () => hasEngine(useEngines.getState());
export const useCanReadAloud = () => useEngines(hasEngine);

// one at a time with the podcast
useTTS.subscribe((state, prev) => {
  if (state.status === 'playing' && prev.status !== 'playing') playing('tts');
});
onPauseRequest('tts', () => {
  const view = ttsView();
  if (view && useTTS.getState().status === 'playing') readerAloud(view)?.pause();
});
