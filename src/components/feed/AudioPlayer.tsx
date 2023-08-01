import { IconPlaylist } from '@tabler/icons-react';
import { SidebarTab, store } from 'lib/store';
import { PodType } from 'types/model';

type Props = {
  currentPod: PodType | null;
  className?: string;
};

export default function AudioPlayer(props: Props) {
  const { currentPod, className = '' } = props;
  // console.log("current pod: ", currentPod)
  
  const TriggerPlaylist = () => {
    store.getState().setIsSidebarOpen(true);
    store.getState().setSidebarTab(SidebarTab.Playlist);
  };

  if (!currentPod) {
    return (<div className='mx-1 text-sm'>no player</div>);
  }

  return (
    <div className={`flex flex-row items-center justify-center ${className}`}>
      <button className='mx-1' onClick={TriggerPlaylist}>
        <IconPlaylist size={24} className="dark:text-slate-300" />
      </button>
      <audio className="ml-1 h-6" autoPlay controls src={currentPod.url} />
    </div>
  )
}
