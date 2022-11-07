import { memo } from 'react';
import { useStore } from 'lib/store';

type Props = {
  className?: string;
};

function Bottombar(props: Props) {
  const { className = '' } = props; 

  const currentPod = useStore((state) => state.currentPod);

  return (
    <div
      className={`flex flex-col w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-300 ${className}`}
    >
      <audio controls src={currentPod?.url}></audio>
    </div>
  );
}

export default memo(Bottombar);
