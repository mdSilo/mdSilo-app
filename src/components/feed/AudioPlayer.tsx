import { useEffect, useState } from 'react';
import { IconPlayerPause, IconPlayerPlay, IconPlaylist } from '@tabler/icons';
import { SidebarTab, store } from 'lib/store';
import { PodType } from './data/dataType';

type Props = {
  currentPod: PodType | null;
  className?: string;
};

export default function AudioPlayer(props: Props) {
  const { currentPod, className = '' } = props;
  console.log("current pod: ", currentPod)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const url = currentPod?.url || '';
    if (url) {
      if (audio) {
        setReady(false);
        audio?.pause();
        setAudio(null);
      }
      const newAudio = new Audio(url);
      if (newAudio) {
        newAudio.addEventListener('canplaythrough', async () => {
          setDuration(newAudio.duration);
          setReady(true);
          newAudio.play();
          setPlaying(true);
        })

        newAudio.addEventListener('timeupdate', () => {
          setCurrentTime(newAudio.currentTime);
        })
        setAudio(newAudio);
      }
    }

    return () => {
      setAudio(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPod])

  useEffect(() => {
    if (audio) {
      if (playing) {
        audio.play();
      } else {
        audio.pause();
      }
    }
  }, [playing, audio])

  const TriggerPlaylist = () => {
    store.getState().setIsSidebarOpen(true);
    store.getState().setSidebarTab(SidebarTab.Playlist);
  };

  if (!currentPod || !audio) {
    return (<div className='mx-1 text-sm'>no player</div>);
  }

  if (!ready) {
    return (<div className='mx-1 text-sm'>Loading</div>);
  }

  return (
    <div className={`flex flex-row items-center justify-center ${className}`}>
      <button className='mx-1' onClick={() => setPlaying(!playing)}>
        {playing 
          ? <IconPlayerPause size={20} className="dark:text-slate-300" /> 
          : <IconPlayerPlay size={20} className="dark:text-slate-300" /> 
        }
      </button>
      <input
        type='range'
        max={duration}
        value={currentTime}
        onChange={(e) => {audio.currentTime = Number(e.target.value)}}
        className="mx-1 w-24"
      />
      <div className='mx-1 text-sm'>
        {`${fmtSec(currentTime)} / ${fmtSec(duration)}`}
      </div>
      <button className='mx-1' onClick={TriggerPlaylist}>
        <IconPlaylist size={20} className="dark:text-slate-300" />
      </button>
    </div>
  )
}

const fmtSec = (seconds: number) => {
  const secs = Math.floor(seconds);
  const minute = Math.floor(secs / 60);
  const second = secs % 60;
  return `${minute}:${second.toString().padStart(2, '0')}`;
}
