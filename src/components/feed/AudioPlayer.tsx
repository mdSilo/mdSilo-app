import { useEffect, useState, useCallback } from 'react';
import { TbPlaylist as IconPlaylist } from 'react-icons/tb';
import { SidebarTab, store } from 'lib/store';
import { PodType } from 'types/model';
import { computePlaylist } from 'components/sidebar/SidebarPlaylist';

type Props = {
  currentPod: PodType | null;
  className?: string;
};

export default function AudioPlayer(props: Props) {
  const { currentPod, className = '' } = props;
  const [playlist, setPlaylist] = useState<PodType[]>([]);
  const [currentTrack, setCurrentTrack] = useState(currentPod);

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
        <IconPlaylist size={24} className="dark:text-slate-300" />
      </button>
      <audio 
        autoPlay 
        controls 
        src={currentTrack.url} 
        onEnded={playNextTrack}
        onError={playNextTrack}
        className="ml-1 h-6" 
      />
    </div>
  );
}
