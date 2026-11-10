import React, {
  useCallback,
  memo,
  forwardRef,
  ForwardedRef,
  HTMLAttributes,
  useState,
  useEffect,
  useMemo,
} from "react";
import { Virtuoso } from "react-virtuoso";
import { TbHeadphones as IconHeadphones } from "react-icons/tb";
import OverlayScroll, { useScroller } from "@/ui/OverlayScroll";
import { useStore } from "@/state/store";
import { Sort } from "@/state/userSettings";
import { ciStringCompare, dateCompare } from "@/lib/helper";
import { PodType as PodTreeItem } from "@/types/model";
import * as dataAgent from "@/feed/dataAgent";
import ErrorBoundary from "@/ui/ErrorBoundary";
import { Tooltip } from "@/ui/ui";
import SidebarItem from "@/shell/sidebar/SidebarItem";
import { useT } from "@/i18n";

type SidebarPlaylistProps = {
  className?: string;
};

function SidebarPlaylist(props: SidebarPlaylistProps) {
  const { className = "" } = props;

  const [data, setData] = useState<PodTreeItem[]>([]);

  const loadData = useCallback(async () => {
    const data = await computePlaylist();
    setData(data);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentPod = useStore((state) => state.currentPod);

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        {data.length > 0 ? (
          <PlayList
            data={data}
            currentPod={currentPod}
            className="flex-1 overflow-y-auto"
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}

export default memo(SidebarPlaylist);

const ROW_HEIGHT = 32;

type TreeProps = {
  data: PodTreeItem[];
  currentPod: PodTreeItem | null;
  className?: string;
};

function Playlist(props: TreeProps) {
  const t = useT();
  const { data, currentPod, className = "" } = props;
  const [podSort, setPodSort] = useState(Sort.DateCreatedDescending);
  const [scroller, scrollerRef] = useScroller();
  // sort a copy: sorting `data` in place keeps the same reference and the
  // memoized row renderer would never re-render the list
  const sortedData = useMemo(() => {
    return data.length >= 2
      ? [...data].sort((n1, n2) => {
          switch (podSort) {
            case Sort.DateCreatedAscending:
              return n2.published && n1.published
                ? dateCompare(n1.published, n2.published)
                : 0;
            case Sort.TitleAscending:
              return ciStringCompare(n1.title, n2.title);
            case Sort.TitleDescending:
              return ciStringCompare(n2.title, n1.title);
            default: // case Sort.DateCreatedDescending:
              return n2.published && n1.published
                ? dateCompare(n2.published, n1.published)
                : 0;
          }
        })
      : data;
  }, [data, podSort]);

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        <div className="flex items-center justify-between border-t border-base-300">
          <Tooltip content={t("Title: A-Z")}>
            <button
              className="p-1 mx-2 rounded-sm hover:bg-base-content/10"
              onClick={() => setPodSort(Sort.TitleAscending)}
            >
              <span
                className={`text-xs ${podSort === Sort.TitleAscending ? "text-primary" : ""}`}
              >
                {t("A-Z")}
              </span>
            </button>
          </Tooltip>
          <Tooltip content={t("Title: Z-A")}>
            <button
              className="p-1 mx-2 rounded-sm hover:bg-base-content/10"
              onClick={() => setPodSort(Sort.TitleDescending)}
            >
              <span
                className={`text-xs ${podSort === Sort.TitleDescending ? "text-primary" : ""}`}
              >
                {t("Z-A")}
              </span>
            </button>
          </Tooltip>
          <Tooltip content={t("Publish: Old-New")}>
            <button
              className="p-1 mx-2 rounded-sm hover:bg-base-content/10"
              onClick={() => setPodSort(Sort.DateCreatedAscending)}
            >
              <span
                className={`text-xs ${podSort === Sort.DateCreatedAscending ? "text-primary" : ""}`}
              >
                {t("Old")}
              </span>
            </button>
          </Tooltip>
          <Tooltip content={t("Publish: New-Old")}>
            <button
              className="p-1 mx-2 rounded-sm hover:bg-base-content/10"
              onClick={() => setPodSort(Sort.DateCreatedDescending)}
            >
              <span
                className={`text-xs ${podSort === Sort.DateCreatedDescending ? "text-primary" : ""}`}
              >
                {t("New")}
              </span>
            </button>
          </Tooltip>
        </div>
        <OverlayScroll scroller={scroller} className="flex-1 min-h-0">
          <Virtuoso
            scrollerRef={scrollerRef}
            data={sortedData}
            fixedItemHeight={ROW_HEIGHT}
            computeItemKey={(index, node) => `${node.title}-${index}`}
            itemContent={(_, node) => (
              <PlayItem
                node={node}
                isHighlighted={node.url === currentPod?.url}
                style={{ height: ROW_HEIGHT }}
              />
            )}
          />
        </OverlayScroll>
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
  forwardedRef: ForwardedRef<HTMLDivElement>,
) => {
  const { node, isHighlighted, className = "", style, ...otherProps } = props;
  const setCurrentPod = useStore((state) => state.setCurrentPod);

  const onClickItem = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setCurrentPod(node);
    },
    [node, setCurrentPod],
  );

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
        onClick={onClickItem}
        style={{ paddingLeft: `8px` }}
        draggable={false}
      >
        <div className="p-1 mr-1 rounded-sm">
          <IconHeadphones size={16} color="red" />
        </div>
        <Tooltip content={node.title} placement="top">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm">
            {node.title}
          </span>
        </Tooltip>
      </div>
    </SidebarItem>
  );
};

const PlayItem = memo(forwardRef(Playitem));

export const computePlaylist = async () => {
  const articles = await dataAgent.getArticleList(null, null, null);
  const res: PodTreeItem[] = articles
    .filter((a) => !!a.audio_url.trim())
    .map((a) => {
      return {
        title: a.title,
        url: a.audio_url,
        published: a.published,
        article_url: a.url,
        feed_link: a.feed_link,
      };
    });

  return res;
};
