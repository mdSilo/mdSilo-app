import React, { useMemo, useCallback, useLayoutEffect, useRef, useState, memo } from 'react';
import List from 'react-virtualized/dist/commonjs/List';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import { NoteTreeItem } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import SidebarNoteLink, { INDENT_PER_LEVEL } from './SidebarNoteLink';

export type NoteTreeRow = {
  node: NoteTreeItem;
  depth: number;
  isExpanded: boolean;
};

type Props = {
  data: NoteTreeRow[];
  className?: string;
};

// row layout, see SidebarNoteLink: indent per level, then icon, title, dropdown
const ROW_CHROME = 8 + 28 + 8 + 32 + 8; // base pad + icon + right pad + dropdown + slack

/**
 * Width needed to show every row in full: the list scrolls horizontally
 * when deep or long rows overflow the sidebar.
 */
export const treeContentWidth = (
  rows: NoteTreeRow[],
  measure: (text: string) => number,
): number => {
  let max = 0;
  for (const { node, depth } of rows) {
    const w = depth * INDENT_PER_LEVEL + ROW_CHROME + measure(node.title);
    if (w > max) max = w;
  }
  return Math.ceil(max);
};

// measure text with canvas, cached per font; fallback to an estimate
const textWidthCache = new Map<string, Map<string, number>>();
let measureCtx: CanvasRenderingContext2D | null | undefined;
const measureText = (text: string, font: string): number => {
  let byText = textWidthCache.get(font);
  if (!byText) {
    byText = new Map();
    textWidthCache.set(font, byText);
  }
  const cached = byText.get(text);
  if (cached !== undefined) return cached;
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  let width: number;
  if (measureCtx) {
    measureCtx.font = font;
    width = measureCtx.measureText(text).width;
  } else {
    width = text.length * 8;
  }
  byText.set(text, width);
  return width;
};

function SidebarNotesTree(props: Props) {
  const { data, className } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // font of the rows, to measure titles
  const [font, setFont] = useState('');
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) setFont(window.getComputedStyle(el).font);
  }, []);

  const currentView = useCurrentViewContext();
  const params = currentView.state.params;
  const noteId = params?.noteId || '';
  
  const currentNoteId = useMemo(() => {
    const id = noteId;
    return id && typeof id === 'string' ? id : undefined;
  }, [noteId]);

  const Row = useCallback(
    ({ index, style }: {index: number; style: React.CSSProperties}) => {
      const { node, depth, isExpanded } = data[index];
      return (
        <SidebarNoteLink
          key={`${node.id}-${index}`}
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          isHighlighted={node.id === currentNoteId}
          style={style}
        />
      );
    },
    [currentNoteId, data]
  );

  const contentWidth = useMemo(
    () => treeContentWidth(data, (text) => measureText(text, font || '16px sans-serif')),
    [data, font]
  );

  return (
    <div ref={containerRef} className={className}>
      <AutoSizer>
        {({ width, height }) => {
          const innerWidth = Math.max(width, contentWidth);
          return (
            <List
              width={width}
              height={height}
              rowCount={data.length}
              rowHeight={32}
              rowRenderer={Row}
              style={{ overflowX: innerWidth > width ? 'auto' : 'hidden', overflowY: 'auto' }}
              // overflow visible: sticky row buttons must stick to the Grid, the scroller
              containerStyle={{ width: innerWidth, maxWidth: innerWidth, overflow: 'visible' }}
            />
          );
        }}
      </AutoSizer>
    </div>
  );
}

export default memo(SidebarNotesTree);
