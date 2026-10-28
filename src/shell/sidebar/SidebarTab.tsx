import { ForwardedRef, forwardRef, memo } from 'react';
import type { IconType as Icon } from 'react-icons';

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
      className={`flex justify-center flex-1 py-1.5 px-4 rounded-t hover:bg-base-content/5 active:bg-base-content/10 border-b-2 border-base-300 ${
        isActive ? 'border-b-primary' : ''
      } ${className}`}
      onClick={setActive}
    >
      <Icon
        size={24}
        className={
          isActive ? 'text-base-content' : 'text-base-content/60'
        }
      />
    </button>
  );
};

export default memo(forwardRef(SidebarTab));
