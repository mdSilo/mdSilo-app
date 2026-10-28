import { memo, useEffect, useState } from 'react';
import {
  TbPlayerPause, TbPlayerPlay, TbPlayerSkipBack, TbPlayerSkipForward, TbPlayerStop,
} from 'react-icons/tb';
import { store, useStore } from 'lib/store';
import { withDefaults } from '../settings';
import { ttsOf, ttsView, useTTS, webSpeech } from '../tts';
import { getView, type Pane } from '../view';

const RATES = [0.75, 1, 1.25, 1.5, 2];

const ttsOptions = () => {
  const settings = withDefaults(store.getState().readerSettings);
  return { voice: settings.ttsVoice || undefined, rate: settings.ttsRate };
};

/** Read the book aloud from a range, or the page shown: of the book last used, or of a pane. */
export function readAloud(from?: Range, pane?: Pane) {
  return ttsOf(getView(pane), ttsOptions)?.start(from);
}

/** Speech synthesis is there to read aloud. */
export const canReadAloud = () => Boolean(webSpeech());

/** The controls of reading aloud, while it goes on. */
function TTSBar() {
  const status = useTTS((state) => state.status);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const setReaderSettings = useStore((state) => state.setReaderSettings);
  const [voices, setVoices] = useState<{ name: string; lang: string }[]>([]);
  // the book read aloud, even if the other one is used meanwhile
  const view = ttsView() ?? getView();
  const lang = view?.language?.canonical?.split('-')[0];

  useEffect(() => {
    const speech = webSpeech();
    if (!speech) return;
    const load = () => setVoices(speech.voices());
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);

  if (status === 'idle') return null;
  const tts = ttsOf(view, ttsOptions);
  const shown = lang ? voices.filter((v) => v.lang.toLowerCase().startsWith(lang)) : voices;

  return (
    <div
      className="absolute z-20 flex items-center gap-1 px-2 py-1 -translate-x-1/2 border rounded-full shadow-md bottom-14 left-1/2 bg-base-100 border-base-300"
      data-testid="tts-bar"
    >
      <button className="btn btn-ghost btn-xs btn-circle" title="Previous" onClick={() => void tts?.skip(false)}>
        <TbPlayerSkipBack />
      </button>
      {status === 'playing' ? (
        <button className="btn btn-ghost btn-xs btn-circle" title="Pause" onClick={() => tts?.pause()}>
          <TbPlayerPause />
        </button>
      ) : (
        <button className="btn btn-ghost btn-xs btn-circle" title="Resume" onClick={() => void tts?.resume()}>
          <TbPlayerPlay />
        </button>
      )}
      <button className="btn btn-ghost btn-xs btn-circle" title="Next" onClick={() => void tts?.skip(true)}>
        <TbPlayerSkipForward />
      </button>
      <button className="btn btn-ghost btn-xs btn-circle" title="Stop" onClick={() => tts?.stop()}>
        <TbPlayerStop />
      </button>
      <select
        className="select select-xs w-16"
        value={settings.ttsRate}
        aria-label="Speed"
        onChange={(e) => setReaderSettings({ ...settings, ttsRate: Number(e.target.value) })}
      >
        {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
      {shown.length > 1 ? (
        <select
          className="select select-xs w-36"
          value={settings.ttsVoice}
          aria-label="Voice"
          onChange={(e) => setReaderSettings({ ...settings, ttsVoice: e.target.value })}
        >
          <option value="">Default voice</option>
          {shown.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
      ) : null}
    </div>
  );
}

export default memo(TTSBar);
