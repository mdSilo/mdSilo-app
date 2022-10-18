import React, { useMemo, useCallback, memo } from 'react';
import List from 'react-virtualized/dist/commonjs/List';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import { NoteTreeItem } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import SidebarNoteLink from './SidebarNoteLink';

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

  const Row = useCallback(
    ({ index, style }: {index: number; style: React.CSSProperties}) => {
      const node = data[index];
      return (
        <SidebarNoteLink
          key={`${node.id}-${index}`}
          node={node}
          isHighlighted={node.id === currentNoteId}
          style={style}
        />
      );
    },
    [currentNoteId, data]
  );

  return (
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
  );
}

export default memo(SidebarNotesTree);
