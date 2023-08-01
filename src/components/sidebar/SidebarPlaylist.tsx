import React, { 
  useCallback, memo, forwardRef, ForwardedRef, HTMLAttributes, useState, useEffect, useMemo 
} from 'react';
import List from 'react-virtualized/dist/commonjs/List';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import { IconHeadphones } from '@tabler/icons-react';
import { useStore } from 'lib/store';
import { Sort } from 'lib/userSettings';
import { ciStringCompare, dateCompare } from 'utils/helper';
import { PodType as PodTreeItem } from 'types/model';
import * as dataAgent from 'components/feed/dataAgent';
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
  const [podSort, setPodSort] = useState(Sort.DateCreatedDescending); 
  const sortedData = useMemo(() => { return data.length >= 2 
    ? data.sort((n1, n2) => {
      switch (podSort) {
        case Sort.DateCreatedAscending:
          return n2.published && n1.published 
            ? dateCompare(n1.published, n2.published)
            : 0;
        case Sort.TitleAscending:
          return ciStringCompare(n1.title, n2.title);
        case Sort.TitleDescending:
          return ciStringCompare(n2.title, n1.title);
        default:  // case Sort.DateCreatedDescending:
          return n2.published && n1.published 
            ? dateCompare(n2.published, n1.published)
            : 0;
      }})
    : data;
  }, [data, podSort])

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
        <div className="flex items-center justify-between border-t dark:border-gray-700">
          <Tooltip content="Title: A-Z">
            <button
              className="p-1 mx-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => setPodSort(Sort.TitleAscending)}
            >
              <span className={podSort === Sort.TitleAscending ? 'text-primary-600 dark:text-primary-400' : ''}>A-Z</span>
            </button>
          </Tooltip>
          <Tooltip content="Title: Z-A">
            <button
              className="p-1 mx-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => setPodSort(Sort.TitleDescending)}
            >
              <span className={podSort === Sort.TitleDescending ? 'text-primary-600 dark:text-primary-400' : ''}>Z-A</span>
            </button>
          </Tooltip>
          <Tooltip content="Publish: Old-New">
            <button
              className="p-1 mx-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => setPodSort(Sort.DateCreatedAscending)}
            >
              <span className={podSort === Sort.DateCreatedAscending ? 'text-primary-600 dark:text-primary-400' : ''}>Old</span>
            </button>
          </Tooltip>
          <Tooltip content="Publish: New-Old">
            <button
              className="p-1 mx-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => setPodSort(Sort.DateCreatedDescending)}
            >
              <span className={podSort === Sort.DateCreatedDescending ? 'text-primary-600 dark:text-primary-400' : ''}>New</span>
            </button>
          </Tooltip>
        </div>
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
    .map(a => { return {
      title: a.title, 
      url: a.audio_url, 
      published: a.published, 
      article_url: a.url, 
      feed_link: a.feed_link
    }});

  return res;
};
