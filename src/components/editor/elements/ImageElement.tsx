import { ReactNode } from 'react';
import { RenderElementProps, useFocused, useSelected } from 'slate-react';
import { Image as ImageType } from 'editor/slate';
import { useStore } from 'lib/store';

type ImageElementProps = {
  element: ImageType;
  children: ReactNode;
  attributes: RenderElementProps['attributes'];
  className?: string;
};

export default function ImageElement(props: ImageElementProps) {
  const { children, attributes, element, className = '' } = props;
  const selected = useSelected();
  const focused = useFocused();
  const currentDir = useStore(state => state.currentDir);
  const realImgUrl = element.url.replace('$DIR$', currentDir || '.');
  return (
    <div className={className} {...attributes}>
      <img
        src={realImgUrl}
        className={`select-none mx-auto max-w-full max-h-full 
          ${selected && focused ? 'ring ring-primary-100 dark:ring-primary-900' : ''}`
        }
        contentEditable={false}
        alt={element.caption}
      />
      {children}
    </div>
  );
}
