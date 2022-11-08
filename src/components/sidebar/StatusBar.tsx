import { memo } from 'react';
import { useStore } from 'lib/store';

type Props = {
  className?: string;
};

function Statusbar(props: Props) {
  const { className = '' } = props; 

  const currentPod = useStore((state) => state.currentPod);
  console.log("current pod: ", currentPod)
  return (
    <div
      className={`flex flex-col w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-300 ${className}`}
    >
      {currentPod && (
        <div className="py-1 flex flex-row items-center justify-center">
          <span className="mx-1 text-xs break-words">{currentPod.title}</span>
          <audio className="mx-1 w-56" controls src={currentPod.url} />
        </div>
      )}
    </div>
  );
}

export default memo(Statusbar);
