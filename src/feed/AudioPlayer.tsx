import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { TbPlaylist as IconPlaylist } from 'react-icons/tb';
import { SidebarTab, store } from '@/state/store';
import { PodType } from '@/types/model';
import { computePlaylist } from '@/feed/Playlist';
import { onPauseRequest, playing } from '@/player/player';
import MediaControls, { formatTime } from '@/player/MediaControls';

type Props = {
  currentPod: PodType | null;
  /** the title shown, e.g. a link to its article */
  title?: ReactNode;
  className?: string;
};

/** The podcast of the player: its audio, played by the controls of the player. */
export default function AudioPlayer(props: Props) {
  const { currentPod, title, className = '' } = props;
  const [playlist, setPlaylist] = useState<PodType[]>([]);
  const [currentTrack, setCurrentTrack] = useState(currentPod);
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  // one at a time with a book read aloud
  useEffect(() => onPauseRequest('podcast', () => audioRef.current?.pause()), []);

  useEffect(() => {
    const fetchPlaylist = async () => {
      const data = await computePlaylist();
      setPlaylist(data);
    };
    fetchPlaylist();
  }, [currentPod]);

  const playTrack = useCallback((step: 1 | -1) => {
    const index = playlist.findIndex((item) => item.url === currentTrack?.url);
    const track = index < 0 ? undefined : playlist[index + step];
    if (track) {
      setCurrentTrack(track);
      store.getState().setCurrentPod(track);
    }
  }, [playlist, currentTrack]);
  const playNextTrack = useCallback(() => playTrack(1), [playTrack]);

  const TriggerPlaylist = () => {
    store.getState().setIsSidebarOpen(true);
    store.getState().setSidebarTab(SidebarTab.Playlist);
  };

  if (!currentTrack) {
    return (<div className='mx-1 text-sm'>no player</div>);
  }

  const index = playlist.findIndex((item) => item.url === currentTrack.url);
  return (
    <div className={`w-full ${className}`}>
      <audio
        ref={audioRef}
        autoPlay
        src={currentTrack.url}
        onPlay={() => { setPaused(false); playing('podcast'); }}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); e.currentTarget.playbackRate = rate; }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onEnded={playNextTrack}
        onError={playNextTrack}
      />
      <MediaControls
        testId="podcast-controls"
        title={title ?? currentTrack.title}
        playing={!paused}
        onPlay={() => void audioRef.current?.play()}
        onPause={() => audioRef.current?.pause()}
        onPrev={index > 0 ? () => playTrack(-1) : undefined}
        onNext={index >= 0 && index < playlist.length - 1 ? () => playTrack(1) : undefined}
        prevTitle="Previous episode"
        nextTitle="Next episode"
        progress={{
          value: time,
          max: Number.isFinite(duration) ? duration : 0,
          label: `${formatTime(time)} / ${formatTime(duration)}`,
          title: 'Position',
          onSeek: (value) => {
            if (audioRef.current) audioRef.current.currentTime = value;
            setTime(value);
          },
        }}
        rate={rate}
        onRate={(r) => {
          setRate(r);
          if (audioRef.current) audioRef.current.playbackRate = r;
        }}
        onClose={() => {
          audioRef.current?.pause();
          store.getState().setCurrentPod(null);
        }}
      >
        <button className="btn btn-ghost btn-xs btn-circle" title="Playlist" onClick={TriggerPlaylist}>
          <IconPlaylist />
        </button>
      </MediaControls>
    </div>
  );
}
