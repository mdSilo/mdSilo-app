import { memo } from 'react';
import { useStore } from 'lib/store';
import AudioPlayer from 'components/feed/AudioPlayer';

type Props = {
  className?: string;
};

function Statusbar(props: Props) {
  const { className = '' } = props; 

  const currentPod = useStore((state) => state.currentPod);
  // console.log("current pod: ", currentPod)
  return (
    <div className={`w-full bg-gray-50 dark:bg-gray-800 dark:text-white ${className}`}>
      {currentPod && (
        <div className="py-1 flex flex-row items-center justify-center">
          <span className="mx-1 text-xs break-words">{currentPod.title}</span>
          <AudioPlayer currentPod={currentPod} className="mx-1 h-6" />
        </div>
      )}
    </div>
  );
}

export default memo(Statusbar);
