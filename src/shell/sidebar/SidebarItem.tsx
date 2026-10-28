import { ForwardedRef, forwardRef, HTMLAttributes, memo } from 'react';

interface SidebarItemProps extends HTMLAttributes<HTMLDivElement> {
  isHighlighted?: boolean;
}

function SidebarItem(
  props: SidebarItemProps,
  forwardedRef: ForwardedRef<HTMLDivElement>
) {
  const { children, className = '', isHighlighted, ...otherProps } = props;
  const itemClassName = `overflow-x-hidden text-ellipsis whitespace-nowrap text-base-content hover:bg-base-content/10 ${isHighlighted ? 'bg-base-300' : 'bg-base-200'} ${className}`;

  return (
    <div ref={forwardedRef} className={itemClassName} {...otherProps}>
      {children}
    </div>
  );
}

export default memo(forwardRef(SidebarItem));
