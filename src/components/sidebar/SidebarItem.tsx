import { ForwardedRef, forwardRef, HTMLAttributes, memo } from 'react';

interface SidebarItemProps extends HTMLAttributes<HTMLDivElement> {
  isHighlighted?: boolean;
}

function SidebarItem(
  props: SidebarItemProps,
  forwardedRef: ForwardedRef<HTMLDivElement>
) {
  const { children, className = '', isHighlighted, ...otherProps } = props;
  const itemClassName = `w-full overflow-x-hidden overflow-ellipsis whitespace-nowrap text-gray-800  hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 ${isHighlighted ? 'bg-gray-300 dark:bg-gray-600' : 'bg-gray-50 dark:bg-gray-800'} ${className}`;

  return (
    <div ref={forwardedRef} className={itemClassName} {...otherProps}>
      {children}
    </div>
  );
}

export default memo(forwardRef(SidebarItem));
