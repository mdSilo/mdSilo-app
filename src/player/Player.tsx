import { memo, useCallback, useEffect } from 'react';
import { TbSettings, TbX } from 'react-icons/tb';
import { store, useStore } from '@/state/store';
import AudioPlayer from '@/feed/AudioPlayer';
import * as dataAgent from '@/feed/dataAgent';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { useEngines } from '@/speech/speech';
import { useTTS } from '@/reader/tts';
import { usePlayer } from './playerStore';
import TTSControls from './TTSControls';
import SpeechSettings from './SpeechSettings';

/** The podcast playing: its title to its article, the playlist, the audio. */
function PodcastControls() {
  const currentPod = useStore((state) => state.currentPod);
  const dispatch = useCurrentViewContext().dispatch;
  const toArticle = useCallback(async (url: string) => {
    const article = await dataAgent.getArticleByUrl(url);
    if (article) {
      store.getState().setCurrentArticle(article);
      dispatch({ view: 'feed' });
    }
  }, [dispatch]);

  if (!currentPod) return null;
  const title = (
    <span
      className="cursor-pointer hover:underline"
      title={currentPod.title}
      onClick={() => void toArticle(currentPod.article_url)}
    >
      {currentPod.title}
    </span>
  );
  // again for another pod: it plays the pod given
  return <AudioPlayer key={currentPod.url} currentPod={currentPod} title={title} />;
}

/**
 * The player of the app, over the bottom of the view: a book read aloud, the
 * podcast. Hidden, it keeps playing; shown or hidden by its side menu button.
 */
function Player() {
  const shown = usePlayer((state) => state.shown);
  const reading = useTTS((state) => state.active);
  const hasPod = useStore((state) => Boolean(state.currentPod));
  const settingsOpen = usePlayer((state) => state.settingsOpen);

  useEffect(() => {
    if (!useEngines.getState().loaded) void useEngines.getState().load();
  }, []);

  return (
    <>
      <div
        className={`absolute z-30 flex flex-col items-stretch gap-1 px-3 py-1.5 -translate-x-1/2 border shadow-md rounded-box bottom-12 left-1/2 w-[34rem] max-w-[calc(100%-2rem)] bg-base-100 border-base-300 divide-y divide-base-300 ${shown ? '' : 'hidden'}`}
        data-testid="player"
      >
        {reading ? <TTSControls /> : null}
        <PodcastControls />
        {!reading && !hasPod ? (
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <span className="flex-1">Nothing playing: read a book aloud, or play a podcast</span>
            <button className="btn btn-ghost btn-xs btn-circle" title="Speech engines" onClick={() => usePlayer.getState().setSettingsOpen(true)}>
              <TbSettings />
            </button>
            <button className="btn btn-ghost btn-xs btn-circle" title="Hide" onClick={() => usePlayer.getState().setShown(false)}>
              <TbX />
            </button>
          </div>
        ) : null}
      </div>
      {/* out of the player: not hidden with it */}
      <SpeechSettings isOpen={settingsOpen} handleClose={() => usePlayer.getState().setSettingsOpen(false)} />
    </>
  );
}

export default memo(Player);
