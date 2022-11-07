import React, { useCallback, memo, forwardRef, ForwardedRef, HTMLAttributes, useState, useEffect } from 'react';
import List from 'react-virtualized/dist/commonjs/List';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import { store, useStore } from 'lib/store';
import * as dataAgent from 'components/feed/data/dataAgent';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Tooltip from 'components/misc/Tooltip';
import SidebarItem from './SidebarItem';

export type TreeItem = {
  title: string;
  url: string;
};

type SidebarPlaylistProps = {
  className?: string;
};

function SidebarPlaylist(props: SidebarPlaylistProps) {
  const { className = '' } = props;

  const [data, setData] = useState<TreeItem[]>([]);
  
  const loadData = useCallback(async () => {
    const data = await computePlaylist();
    setData(data);
  }, []);

  useEffect(() => { loadData(); }, []);

  const currentPod = useStore((state) => state.currentPod);

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        <div className="py-1 flex flex-col items-center justify-center">
          <span className="text-xs">{currentPod?.title || ''}</span>
          <audio className="w-56" controls src={currentPod?.url} />
        </div>
        {data.length > 0 ? (
          <PlayList data={data} className="flex-1 overflow-y-auto" />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}

export default memo(SidebarPlaylist);


type TreeProps = {
  data: TreeItem[];
  className?: string;
};

function Playlist(props: TreeProps) {
  const { data, className = '' } = props;
  console.log("play data", data)

  const Row = useCallback(
    ({ index, style }: {index: number; style: React.CSSProperties}) => {
      const node = data[index];
      return (
        <PlayItem
          key={`${node.title}-${index}`}
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

const PlayList =  memo(Playlist);


interface ItemProps extends HTMLAttributes<HTMLDivElement> {
  node: TreeItem;
  isHighlighted?: boolean;
}

const Playitem = (
  props: ItemProps,
  forwardedRef: ForwardedRef<HTMLDivElement>
) => {
  const { node, isHighlighted, className = '', style, ...otherProps } = props;

  const onClickItem = useCallback(async (e) => {
    e.preventDefault();
    store.getState().setCurrentPod(node);
  }, [node]);
  
  return (
    <SidebarItem
      ref={forwardedRef}
      className={`relative flex items-center justify-between overflow-x-hidden group focus:outline-none ${className}`}
      isHighlighted={isHighlighted}
      style={style}
      {...otherProps}
    >
      <div
        role="button"
        className="flex items-center flex-1 px-2 py-1 overflow-hidden select-none overflow-ellipsis whitespace-nowrap"
        onClick={onClickItem}
        style={{ paddingLeft: `8px` }}
        draggable={false}
      >
        <Tooltip content={node.title} placement="top">
          <span className="overflow-hidden overflow-ellipsis whitespace-nowrap text-sm">
            {node.title}
          </span>
        </Tooltip>
      </div>
    </SidebarItem>
  );
};

const PlayItem = memo(forwardRef(Playitem));


const computePlaylist = async () => {
  const articles = await dataAgent.getArticleList(null, null, null);
  const res: TreeItem[] = articles
    .filter(a => !!(a.audio_url.trim()))
    .map(a => { return {title: a.title, url: a.audio_url}});

  console.log("playlist articles", res, articles)

  return res;
};
