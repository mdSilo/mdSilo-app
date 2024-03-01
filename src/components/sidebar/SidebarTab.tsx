import { ForwardedRef, forwardRef, memo } from 'react';
import { Icon } from '@tabler/icons-react';

type Props = {
  isActive: boolean;
  setActive: () => void;
  Icon: Icon;
  className?: string;
};

const SidebarTab = (
  props: Props,
  forwardedRef: ForwardedRef<HTMLButtonElement>
) => {
  const { isActive, setActive, Icon, className = '' } = props;
  return (
    <button
      ref={forwardedRef}
      className={`flex justify-center flex-1 py-1.5 px-4 rounded-t hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 border-b-2  dark:border-gray-700 ${
        isActive ? 'border-b-green-700 dark:border-b-green-600' : ''
      } ${className}`}
      onClick={setActive}
    >
      <Icon
        size={24}
        className={
          isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'
        }
      />
    </button>
  );
};

export default memo(forwardRef(SidebarTab));
