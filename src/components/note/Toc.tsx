import { useState } from 'react';
import { IconCaretRight, IconPoint } from '@tabler/icons-react';

export type Heading = {
  title: string;
  level: number;
  id: string;
};

type Props = {
  headings: Heading[];
  metaInfo?: string;
  className?: string;
};

export default function Toc(props: Props) {
  const { headings, metaInfo = '', className = '' } = props;
  const [showTOC, setShowTOC] = useState<boolean>(false);

  return (
    <>
      <button
        className="inline-flex items-center p-1 group"
        onClick={(e) => {
          e.stopPropagation();
          setShowTOC(!showTOC);
        }}
      >
        <IconCaretRight
          className={`mr-1 text-gray-500 dark:text-gray-200 ${showTOC ? 'rotate-90' : ''}`}
          size={16}
          fill="currentColor"
        />
        Table of Contents {` ${metaInfo}`}
      </button>
      {showTOC && headings.length ? (
        <div className={`pb-4 border-b-2 border-gray-200 dark:border-gray-600 ${className}`}>
          {headings.map((heading) => (
            <div
              key={heading.id}
              className="flex items-center select-none link"
              style={{ 
                paddingLeft: `${heading.level * 12}px`, 
                fontSize: `${Math.max((12 - heading.level) * 2, 16)}px` 
              }}
            >
              <IconPoint size={12} className="mr-1" fill="currentColor" />
              <a href={`#${heading.id}`}>{heading.title}</a>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
