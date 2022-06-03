import { useState, useMemo, useCallback, memo } from 'react';
import List from 'react-virtualized/dist/commonjs/List';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { NoteTreeItem, useStore } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import Portal from 'components/misc/Portal';
import { moveNoteTreeItem } from 'components/note/NoteMoveInput';
import { writeJsonFile } from 'file/write';
import FileAPI from 'file/files';
import SidebarNoteLink from './SidebarNoteLink';
import DraggableSidebarNoteLink from './DraggableSidebarNoteLink';

export type FlattenedNoteTreeItem = {
  id: string;
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

  const notes = useStore((state) => state.notes);
  const currentDir = useStore((state) => state.currentDir);

  const [activeId, setActiveId] = useState<string | null>(null);
  
  const flattenNode = useCallback(
    (node: NoteTreeItem, depth: number, result: FlattenedNoteTreeItem[]) => {
      const { id, children, collapsed } = node;
      result.push({ id, depth, collapsed });
      /**
       * Only push in children if:
       * 1. The node is not collapsed
       * 2. The node has children
       * 3. The node is not the active node (i.e. being dragged)
       */
      if (!collapsed && children.length > 0 && node.id !== activeId) {
        for (const child of children) {
          flattenNode(child, depth + 1, result);
        }
      }
    },
    [activeId]
  );

  const flattenedData = useMemo(() => {
    const result: FlattenedNoteTreeItem[] = [];
    for (const node of data) {
      flattenNode(node, 0, result);
    }
    return result;
  }, [data, flattenNode]);

  const resetState = useCallback(() => {
    setActiveId(null);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (over) {
        const dirId = over.id;
        const tarDir = notes[dirId];
        if (!tarDir || !tarDir.is_dir) return;

        const activeId = active.id;
        const thisFile = new FileAPI(activeId);
        const tarPath = await thisFile.moveFile(dirId);
        if (tarPath) {
          const oldNote =  notes[activeId];
          moveNoteTreeItem(activeId, dirId, tarPath, oldNote); 
        }
      } 
      // sync the Moved hierarchy to JSON
      if (currentDir) {
        await writeJsonFile(currentDir);
      }
      resetState();
    },
    [currentDir, resetState, notes]
  );

  const Row = useCallback(
    ({ index, style }) => {
      const node = flattenedData[index];
      return (
        <DraggableSidebarNoteLink
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={flattenedData}
          strategy={verticalListSortingStrategy}
        >
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
        </SortableContext>
        <Portal>
          <DragOverlay>
            {activeId ? (
              <SidebarNoteLink
                node={
                  flattenedData.find((node) => node.id === activeId) ?? {
                    id: activeId,
                    depth: 0,
                    collapsed: false,
                  }
                }
                className="shadow-popover !bg-gray-50 dark:!bg-gray-800"
              />
            ) : null}
          </DragOverlay>
        </Portal>
      </DndContext>
    </div>
  );
}

export default memo(SidebarNotesTree);
