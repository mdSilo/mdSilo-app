import { useEffect, useState, useCallback, useRef } from 'react';
import { TbPlaylist as IconPlaylist } from 'react-icons/tb';
import { SidebarTab, store } from '@/state/store';
import { PodType } from '@/types/model';
import { computePlaylist } from '@/feed/Playlist';
import { onPauseRequest, playing } from '@/player/player';

type Props = {
  currentPod: PodType | null;
  className?: string;
};

export default function AudioPlayer(props: Props) {
  const { currentPod, className = '' } = props;
  const [playlist, setPlaylist] = useState<PodType[]>([]);
  const [currentTrack, setCurrentTrack] = useState(currentPod);
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

  const playNextTrack = useCallback(() => {
    const len = playlist.length;
    if (len <= 0) return;
    const currentIndex = playlist.findIndex((item) => item.url === currentTrack?.url);
    if (currentIndex < len - 1) {
      const nextTrack =playlist[currentIndex + 1];
      if (nextTrack) {
        setCurrentTrack(nextTrack);
        store.getState().setCurrentPod(nextTrack);
      }
    }
  }, [playlist, currentTrack]);

  const TriggerPlaylist = () => {
    store.getState().setIsSidebarOpen(true);
    store.getState().setSidebarTab(SidebarTab.Playlist);
  };

  if (!currentTrack) {
    return (<div className='mx-1 text-sm'>no player</div>);
  }

  return (
    <div className={`flex flex-row items-center justify-center ${className}`}>
      <button className='mx-1' onClick={TriggerPlaylist}>
        <IconPlaylist size={24} className="" />
      </button>
      <audio
        ref={audioRef}
        autoPlay
        controls
        onPlay={() => playing('podcast')}
        src={currentTrack.url} 
        onEnded={playNextTrack}
        onError={playNextTrack}
        className="ml-1 h-6" 
      />
    </div>
  );
}
