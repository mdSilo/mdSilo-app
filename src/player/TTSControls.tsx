import { memo, useEffect, useState } from 'react';
import { TbSettings } from 'react-icons/tb';
import { useStore } from '@/state/store';
import { speechOf, useEngines, voicesOf, type Voice } from '@/speech/speech';
import { formatLanguageMap } from '@/reader/document';
import { withDefaults } from '@/reader/settings';
import { stopTTS, ttsView, useTTS } from '@/reader/tts';
import { readerAloud, ttsEngine } from '@/reader/readAloud';
import { getView } from '@/reader/view';
import MediaControls from './MediaControls';
import { usePlayer } from './player';

/** The fraction of the book shown, as it turns. */
function useFraction(view: ReturnType<typeof getView>) {
  const [fraction, setFraction] = useState(view?.lastLocation?.fraction ?? 0);
  useEffect(() => {
    if (!view) return;
    setFraction(view.lastLocation?.fraction ?? 0);
    const onRelocate = (e: Event) => setFraction((e as CustomEvent<{ fraction?: number }>).detail?.fraction ?? 0);
    view.addEventListener('relocate', onRelocate);
    return () => view.removeEventListener('relocate', onRelocate);
  }, [view]);
  return fraction;
}

/** The controls of a book read aloud: the engine, the voice, the rate, where in the book. */
function TTSControls() {
  const status = useTTS((state) => state.status);
  const error = useTTS((state) => state.error);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const setReaderSettings = useStore((state) => state.setReaderSettings);
  const engines = useEngines((state) => state.engines);
  const [voices, setVoices] = useState<Voice[]>([]);
  // the book read aloud, even if the other one is used meanwhile
  const view = ttsView() ?? getView();
  const fraction = useFraction(view);
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

  const tts = () => readerAloud(view);
  const usable = engines.filter((e) => e.available);
  const shown = voicesOf(voices, lang);
  // a change of engine while reading: on with the new one
  const restart = () => {
    if (status === 'playing') {
      tts()?.pause();
      void tts()?.resume();
    }
  };
  const title = view ? formatLanguageMap(view.book?.metadata?.title) : '';

  return (
    <div className="flex flex-col w-full gap-0.5" data-testid="tts-bar">
      <MediaControls
        title={title ? `Read aloud: ${title}` : 'Read aloud'}
        playing={status === 'playing'}
        onPlay={() => void (status === 'paused' ? tts()?.resume() : tts()?.start())}
        onPause={() => tts()?.pause()}
        onPrev={status !== 'idle' ? () => void tts()?.skip(false) : undefined}
        onNext={status !== 'idle' ? () => void tts()?.skip(true) : undefined}
        prevTitle="Previous paragraph"
        nextTitle="Next paragraph"
        onStop={status !== 'idle' ? () => tts()?.stop() : undefined}
        progress={view ? {
          value: fraction,
          max: 1,
          label: `${Math.round(fraction * 100)}%`,
          title: 'Where in the book',
          onSeek: (value) => {
            const playing = status === 'playing';
            if (playing) tts()?.pause();
            void view.goToFraction(value).then(() => { if (playing) void tts()?.start(); });
          },
        } : undefined}
        rate={settings.ttsRate}
        onRate={(rate) => setReaderSettings({ ...settings, ttsRate: rate })}
        onClose={() => stopTTS()}
      >
        {usable.length > 1 ? (
          <select
            className="select select-xs w-32"
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
            className="select select-xs w-32"
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
        <button className="btn btn-ghost btn-xs btn-circle" title="Speech engines" onClick={() => usePlayer.getState().setSettingsOpen(true)}>
          <TbSettings />
        </button>
      </MediaControls>
      {error ? (
        <span className="text-xs text-error" role="alert">{error}</span>
      ) : null}
    </div>
  );
}

export default memo(TTSControls);
