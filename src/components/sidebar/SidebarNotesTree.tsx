import React, { useMemo, useCallback, memo } from 'react';
import List from 'react-virtualized/dist/commonjs/List';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import { NoteTreeItem } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import SidebarNoteLink from './SidebarNoteLink';

export type FlattenedNoteTreeItem = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string; 
  isDir: boolean;
  depth: number;
  collapsed: boolean;
};

type Props = {
  data: NoteTreeItem[];
  className?: string;
};

function SidebarNotesTree(props: Props) {
  const { data, className } = props;

  const currentView = useCurrentViewContext();
  const params = currentView.state.params;
  const noteId = params?.noteId || '';
  
  const currentNoteId = useMemo(() => {
    const id = noteId;
    return id && typeof id === 'string' ? id : undefined;
  }, [noteId]);
  
  const flattenNode = useCallback(
    (node: NoteTreeItem, depth: number, result: FlattenedNoteTreeItem[]) => {
      const { id, title, created_at, updated_at, isDir, children, collapsed } = node;
      result.push({ id, title, created_at, updated_at, isDir, depth, collapsed });
      /**
       * Only push in children if:
       * 1. The node is not collapsed
       * 2. The node has children
       */
      if (!collapsed && children.length > 0) {
        for (const child of children) {
          flattenNode(child, depth + 1, result);
        }
      }
    },
    []
  );

  const flattenedData = useMemo(() => {
    const result: FlattenedNoteTreeItem[] = [];
    for (const node of data) {
      flattenNode(node, 0, result);
    }
    return result;
  }, [data, flattenNode]);

  const Row = useCallback(
    ({ index, style }: {index: number; style: React.CSSProperties}) => {
      const node = flattenedData[index];
      return (
        <SidebarNoteLink
          key={`${node.id}-${index}`}
          node={node}
          isHighlighted={node.id === currentNoteId}
          style={style}
        />
      );
    },
    [currentNoteId, flattenedData]
  );

  return (
    <div className={className}>
      <AutoSizer>
        {({ width, height }) => (
          <List
            width={width}
            height={height}
            rowCount={flattenedData.length}
            rowHeight={32}
            rowRenderer={Row}
          />
        )}
      </AutoSizer>
    </div>
  );
}

export default memo(SidebarNotesTree);
