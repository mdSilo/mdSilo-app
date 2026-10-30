import { memo, useEffect, useState } from 'react';
import {
  TbPlayerPause, TbPlayerPlay, TbPlayerSkipBack, TbPlayerSkipForward, TbPlayerStop, TbSettings, TbX,
} from 'react-icons/tb';
import { useStore } from '@/state/store';
import { speechOf, useEngines, voicesOf, type Voice } from '@/speech/speech';
import { withDefaults } from '@/reader/settings';
import { ttsView, useTTS } from '@/reader/tts';
import { readerAloud, ttsEngine } from '@/reader/readAloud';
import { getView } from '@/reader/view';
import SpeechSettings from './SpeechSettings';

const RATES = [0.75, 1, 1.25, 1.5, 2];

/** The controls of a book read aloud: the engine, the voice, the rate. */
function TTSControls() {
  const status = useTTS((state) => state.status);
  const error = useTTS((state) => state.error);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const setReaderSettings = useStore((state) => state.setReaderSettings);
  const engines = useEngines((state) => state.engines);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // the book read aloud, even if the other one is used meanwhile
  const view = ttsView() ?? getView();
  const tts = status !== 'idle' ? readerAloud(view) : undefined;
  const lang = view?.language?.canonical?.split('-')[0];
  // the engine reading: as chosen, if it can be used
  const engine = engines.length ? ttsEngine() : undefined;

  useEffect(() => {
    let current = true;
    const speech = engine ? speechOf(engine) : undefined;
    setVoices([]);
    speech?.voices().then((v) => { if (current) setVoices(v); }).catch(() => undefined);
    return () => { current = false; };
  }, [engine?.id, engine]);

  const usable = engines.filter((e) => e.available);
  const shown = voicesOf(voices, lang);
  // a change of engine while reading: on with the new one
  const restart = () => {
    if (status === 'playing' && tts) {
      tts.pause();
      void tts.resume();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="tts-bar">
      {status !== 'idle' ? (
        <>
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
        </>
      ) : null}
      <select
        className="select select-xs w-16"
        value={settings.ttsRate}
        aria-label="Speed"
        onChange={(e) => setReaderSettings({ ...settings, ttsRate: Number(e.target.value) })}
      >
        {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
      {usable.length > 1 ? (
        <select
          className="select select-xs w-36"
          value={engine?.id ?? ''}
          aria-label="Engine"
          onChange={(e) => {
            setReaderSettings({ ...settings, ttsEngine: e.target.value });
            restart();
          }}
        >
          {usable.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      ) : null}
      {engine && shown.length > 1 ? (
        <select
          className="select select-xs w-36"
          value={settings.ttsVoices[engine.id] ?? ''}
          aria-label="Voice"
          onChange={(e) => setReaderSettings({
            ...settings,
            ttsVoices: { ...settings.ttsVoices, [engine.id]: e.target.value },
          })}
        >
          <option value="">Default voice</option>
          {shown.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      ) : null}
      <button className="btn btn-ghost btn-xs btn-circle" title="Speech engines" onClick={() => setSettingsOpen(true)}>
        <TbSettings />
      </button>
      {error ? (
        <span className="flex items-center gap-1 text-xs text-error" role="alert">
          {error}
          <button className="btn btn-ghost btn-xs btn-circle" title="Dismiss" onClick={() => useTTS.getState().setError()}>
            <TbX />
          </button>
        </span>
      ) : null}
      <SpeechSettings isOpen={settingsOpen} handleClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default memo(TTSControls);
