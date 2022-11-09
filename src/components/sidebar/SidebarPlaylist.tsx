import React, { 
  useCallback, memo, forwardRef, ForwardedRef, HTMLAttributes, useState, useEffect 
} from 'react';
import List from 'react-virtualized/dist/commonjs/List';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import { IconHeadphones } from '@tabler/icons';
import { useStore } from 'lib/store';
import { dateCompare } from 'utils/helper';
import * as dataAgent from 'components/feed/data/dataAgent';
import { PodType as PodTreeItem } from 'components/feed/data/dataType';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Tooltip from 'components/misc/Tooltip';
import SidebarItem from './SidebarItem';

type SidebarPlaylistProps = {
  className?: string;
};

function SidebarPlaylist(props: SidebarPlaylistProps) {
  const { className = '' } = props;

  const [data, setData] = useState<PodTreeItem[]>([]);
  
  const loadData = useCallback(async () => {
    const data = await computePlaylist();
    setData(data);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const currentPod = useStore((state) => state.currentPod);

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        {data.length > 0 ? (
          <PlayList data={data} currentPod={currentPod} className="flex-1 overflow-y-auto" />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}

export default memo(SidebarPlaylist);


type TreeProps = {
  data: PodTreeItem[];
  currentPod: PodTreeItem | null; 
  className?: string;
};

function Playlist(props: TreeProps) {
  const { data, currentPod, className = '' } = props;

  const sortedData = data.length >= 2 
    ? data.sort((n1, n2) => {
        return n2.published && n1.published 
          ? dateCompare(n2.published, n1.published)
          : 0;
      })
    : data;

  const Row = useCallback(
    ({ index, style }: {index: number; style: React.CSSProperties}) => {
      const node = sortedData[index];
      return (
        <PlayItem
          key={`${node.title}-${index}`}
          node={node}
          isHighlighted={node.url === currentPod?.url}
          style={style}
        />
      );
    },
    [sortedData, currentPod]
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

const PlayList = memo(Playlist);


interface ItemProps extends HTMLAttributes<HTMLDivElement> {
  node: PodTreeItem;
  isHighlighted?: boolean;
}

const Playitem = (
  props: ItemProps,
  forwardedRef: ForwardedRef<HTMLDivElement>
) => {
  const { node, isHighlighted, className = '', style, ...otherProps } = props;
  const setCurrentPod = useStore((state) => state.setCurrentPod);

  const onClickItem = useCallback((e) => {
    e.preventDefault();
    setCurrentPod(node);
  }, [node, setCurrentPod]);
  
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
        <div className="p-1 mr-1 rounded">
          <IconHeadphones size={16} color="red" />
        </div>
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
  const res: PodTreeItem[] = articles
    .filter(a => !!(a.audio_url.trim()))
    .map(a => { return {title: a.title, url: a.audio_url, published: a.published}});

  return res;
};
