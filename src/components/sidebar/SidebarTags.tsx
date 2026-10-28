import React, { useCallback, memo, forwardRef, ForwardedRef, HTMLAttributes } from 'react';
import { List } from 'react-virtualized';
import AutoSizer from 'react-virtualized-auto-sizer';
import { TbHash as IconHash } from 'react-icons/tb';
import { useCurrentViewContext } from '@/context/useCurrentView';
import { NoteMap, useStore } from '@/lib/store';
import { indexOf } from '@/lib/linkIndex';
import ErrorBoundary from '@/components/misc/ErrorBoundary';
import SidebarItem from './SidebarItem';

export type TagTreeItem = {
  name: string;
  num: number;
};

type SidebarTagsProps = {
  className?: string;
};

function SidebarTags(props: SidebarTagsProps) {
  const { className = '' } = props;
  
  const notes = useStore(state => state.notes);
  const data = computeTags(notes);

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        {data.length > 0 ? (
          <TagTree data={data} className="flex-1 overflow-y-auto" />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}

export default memo(SidebarTags);


type TreeProps = {
  data: TagTreeItem[];
  className?: string;
};

function SidebarTagTree(props: TreeProps) {
  const { data, className = '' } = props;
  // console.log("tag data", data)

  const Row = useCallback(
    ({ index, style }: {index: number; style: React.CSSProperties}) => {
      const node = data[index];
      return (
        <Tag
          key={`${node.name}-${index}`}
          node={node}
          style={style}
        />
      );
    },
    [data]
  );

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        <div className={className}>
          <AutoSizer>
            {({ width, height }) => (
              <List
                width={width}
                height={height}
                rowCount={data.length}
                rowHeight={32}
                rowRenderer={Row}
              />
            )}
          </AutoSizer>
        </div>
      </div>
  </ErrorBoundary>
  );
}

const TagTree =  memo(SidebarTagTree);


interface TagProps extends HTMLAttributes<HTMLDivElement> {
  node: TagTreeItem;
  isHighlighted?: boolean;
}

const SidebarTag = (
  props: TagProps,
  forwardedRef: ForwardedRef<HTMLDivElement>
) => {
  const { node, isHighlighted, className = '', style, ...otherProps } = props;
  // console.log("node: ", node)
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onClickTag = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dispatch({view: 'tag', tag: node.name});
  }, [dispatch, node]);
  
  return (
    <SidebarItem
      ref={forwardedRef}
      className={`relative flex items-center justify-between overflow-x-hidden group focus:outline-hidden ${className}`}
      isHighlighted={isHighlighted}
      style={style}
      {...otherProps}
    >
      <div
        role="button"
        className="flex items-center flex-1 px-2 py-1 overflow-hidden select-none text-ellipsis whitespace-nowrap"
        onClick={onClickTag}
        style={{ paddingLeft: `16px` }}
        draggable={false}
      >
        <div
          className="p-1 rounded-sm hover:bg-base-content/15 active:bg-base-content/25"
        >
          <IconHash 
            className="shrink-0 text-base-content/60"
            size={16}
            color={`${['purple','cyan','green','red','orange','blue','yellow'][node.num % 7]}`}
          />
        </div>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          {node.name}
        </span>
      </div>
      <span className="px-2">{node.num}</span>
    </SidebarItem>
  );
};

const Tag = memo(forwardRef(SidebarTag));


const computeTags = (notes: NoteMap) => {
  const notesArr = notes.values().filter(n => !n.is_dir);
  const tagNames: Record<string, number> = {};
  // the tags of each note, from the index: found once per content
  const index = indexOf(notes);
  for (const note of notesArr) {
    for (const tag of index.tags(note.id)) {
      tagNames[tag] = tagNames[tag] ? tagNames[tag] + 1 : 1;
    }
  }
  const res : TagTreeItem[] = [];
  for (const tag of Object.keys(tagNames)) {
    res.push({name: tag, num: tagNames[tag]});
  }

  return res;
};
