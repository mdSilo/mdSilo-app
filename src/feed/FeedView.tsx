import { useCallback, useEffect, useState } from "react";
import { TbChevronLeft } from "react-icons/tb";
import useIsMobile from "@/lib/hooks/useIsMobile";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { store, useStore } from "@/state/store";
import { ArticleType, ChannelType } from "@/types/model";
import ErrorBoundary from "@/ui/ErrorBoundary";
import { ChannelList } from "@/feed/ChannelList";
import { Channel } from "@/feed/Channel";
import { ArticleView } from "@/feed/ArticleView";
import { FeedManager } from "@/feed/FeedManager";
import { OpdsBrowser } from "@/feed/OpdsBrowser";
import * as dataAgent from "@/feed/dataAgent";
import ViewMenu, { useMenuInView } from "@/shell/ViewMenu";
import ResizeHandle, { useResizableWidth } from "@/ui/ResizeHandle";
import { FEED_ARTICLE_WIDTH, FEED_CHANNEL_WIDTH } from "@/state/userSettings";

/** the pane shown on a phone */
type MobilePane = "channels" | "articles" | "article" | "manager" | "catalog";

export default function Feed() {
  const dispatch = useCurrentViewContext().dispatch;
  const openNote = useCallback(
    (noteId: string) => dispatch({ view: "md", params: { noteId } }),
    [dispatch],
  );
  const openBook = useCallback(
    (path: string) => dispatch({ view: "book", path }),
    [dispatch],
  );
  // channel list
  const [channelList, setChannelList] = useState<ChannelType[]>([]);
  const [currentChannel, setCurrentChannel] = useState<ChannelType | null>(
    null,
  );
  const [currentArticles, setCurrentArticles] = useState<ArticleType[] | null>(
    null,
  );
  const [currentArticle, setCurrentArticle] = useState<ArticleType | null>(
    null,
  );
  const [starChannel, setStarChannel] = useState(false);
  // an OPDS catalog browsed, in place of the articles
  const [currentCatalog, setCurrentCatalog] = useState<ChannelType | null>(
    null,
  );
  const [showManager, setShowManager] = useState(false);
  // a phone: one pane at a time, from the channels down to an article
  const mobile = useIsMobile();
  const menuInView = useMenuInView();
  const [mobilePane, setMobilePane] = useState<MobilePane>("channels");

  const storeArticle = useStore((state) => state.currentArticle);

  // resizable columns, widths saved in user settings
  const channelCol = useResizableWidth(
    useStore((state) => state.feedChannelWidth),
    useStore((state) => state.setFeedChannelWidth),
    FEED_CHANNEL_WIDTH,
  );
  const articleCol = useResizableWidth(
    useStore((state) => state.feedArticleWidth),
    useStore((state) => state.setFeedArticleWidth),
    FEED_ARTICLE_WIDTH,
  );

  const getList = () => {
    Promise.all([dataAgent.getChannels(), dataAgent.getUnreadNum()]).then(
      ([channels, unreadNum]) => {
        channels.forEach((item) => {
          item.unread = unreadNum[item.link] || 0;
        });

        setChannelList(channels);
      },
    );
  };

  useEffect(() => {
    getList();
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [doneNum, setDoneNum] = useState(0);
  const refreshChannel = async (link: string, ty: string, title: string) => {
    const res = await dataAgent.addChannel(link, ty, title);
    return res;
  };

  const refreshList = async () => {
    setRefreshing(true);
    setDoneNum(0);
    // the catalogs have no articles to refresh
    for (const channel of channelList.filter((c) => c.ty !== "opds")) {
      await refreshChannel(channel.link, channel.ty, channel.title);
      setDoneNum((n) => n + 1);
    }
    setRefreshing(false);
  };

  const onShowManager = () => {
    setShowManager(!showManager);
    setMobilePane(showManager ? "channels" : "manager");
  };

  const loadArticleList = async (link: string) => {
    const articles = await dataAgent.getArticleList(link, null, null);
    // console.log("current articles", articles, currentArticles);
    setCurrentArticles(articles);
  };

  const [loading, setLoading] = useState(false);
  const onClickFeed = async (link: string) => {
    setLoading(true);
    const clickedChannel = channelList.find((c) => c.link === link);
    if (clickedChannel?.ty === "opds") {
      setCurrentCatalog(clickedChannel);
      setShowManager(false);
      setMobilePane("catalog");
    } else if (clickedChannel) {
      setCurrentCatalog(null);
      setCurrentChannel(clickedChannel);
      setShowManager(false);
      setMobilePane("articles");
      await loadArticleList(clickedChannel.link);
    }
    setLoading(false);
  };

  const onClickStar = async () => {
    setLoading(true);
    setCurrentChannel(null);
    setCurrentArticles(null);
    setCurrentCatalog(null);
    setStarChannel(true);
    setShowManager(false);
    setMobilePane("articles");
    const starArticles = await dataAgent.getArticleList(null, null, 1);
    setCurrentArticles(starArticles);
    setLoading(false);
  };

  const handleAddFeed = async (feedUrl: string, ty: string, title: string) => {
    const res = await dataAgent.addChannel(feedUrl, ty, title);
    if (res > 0) {
      getList();
    }
  };

  const handleDeleteFeed = async (channel: ChannelType) => {
    if (channel && channel.link) {
      await dataAgent.deleteChannel(channel.link);
      if (currentCatalog?.link === channel.link) setCurrentCatalog(null);
      getList();
    }
  };

  // currentChannel and it's article list
  const [syncing, setSyncing] = useState(false);
  const handleRefresh = async () => {
    setSyncing(true);
    if (currentChannel) {
      // console.log("refresh current channel: ", currentChannel)
      await dataAgent.addChannel(
        currentChannel.link,
        currentChannel.ty,
        currentChannel.title,
      );
      await loadArticleList(currentChannel.link);
    }
    setSyncing(false);
  };

  const updateAllReadStatus = async (feedLink: string, status: number) => {
    const res = await dataAgent.updateAllReadStatus(feedLink, status);
    if (res === 0) return;
    getList();
    await handleRefresh();
  };

  const onClickArticle = async (article: ArticleType) => {
    setCurrentArticle(article);
    store.getState().setCurrentArticle(article);
    setMobilePane("article");
    if (article.read_status !== 0) return;
    // update read_status to db
    const res = await dataAgent.updateArticleReadStatus(article.url, 1);
    if (res === 0) return;
    getList();
  };

  const updateStarStatus = async (url: string, status: number) => {
    await dataAgent.updateArticleStarStatus(url, status);
  };

  const [hideCol, setHideCol] = useState(false);
  const hideChannelCol = () => {
    // a phone: the article is the only pane, back to the articles
    if (mobile) setMobilePane("articles");
    else setHideCol(!hideCol);
  };
  const [isHideChannel, setIsHideChannel] = useState(false);
  useEffect(() => {
    setIsHideChannel(
      hideCol || !(currentArticles && currentArticles.length > 0),
    );
  }, [currentArticles, hideCol]);

  if (mobile) {
    const channels = (
      <>
        {menuInView ? (
          <div className="flex items-center shrink-0 gap-1 px-1 border-b border-base-300">
            <ViewMenu />
            <span className="text-sm font-semibold truncate">Feeds</span>
          </div>
        ) : null}
        <div className="flex-1 min-h-0 p-1 overflow-y-auto">
          <ChannelList
            channelList={channelList}
            refreshList={refreshList}
            onShowManager={onShowManager}
            onClickFeed={onClickFeed}
            onClickStar={onClickStar}
            refreshing={refreshing}
            doneNum={doneNum}
          />
        </div>
      </>
    );
    // the menu of the app before it, on a phone: see ViewMenu
    const back = (label: string, to: MobilePane) => (
      <div className="flex items-center shrink-0 ps-1 border-b border-base-300">
        <ViewMenu />
        <button
          className="flex items-center flex-1 min-w-0 gap-1 px-2 py-2 text-sm text-base-content/70 hover:bg-base-content/10"
          onClick={() => {
            if (to === "channels") setShowManager(false);
            setMobilePane(to);
          }}
        >
          <TbChevronLeft size={18} className="shrink-0 rtl:rotate-180" />
          <span className="truncate">{label}</span>
        </button>
      </div>
    );
    const article = currentArticle || storeArticle;
    let pane = channels;
    if (mobilePane === "manager" && showManager) {
      pane = (
        <>
          {back("Channels", "channels")}
          <div className="flex-1 min-h-0 p-2 overflow-y-auto">
            <FeedManager
              channelList={channelList}
              handleAddFeed={handleAddFeed}
              handleDelete={handleDeleteFeed}
            />
          </div>
        </>
      );
    } else if (mobilePane === "catalog" && currentCatalog) {
      pane = (
        <>
          {back("Channels", "channels")}
          <div className="flex-1 min-h-0 p-1">
            <OpdsBrowser
              key={currentCatalog.link}
              channel={currentCatalog}
              onOpenBook={openBook}
            />
          </div>
        </>
      );
    } else if (mobilePane === "article" && article) {
      pane = (
        <>
          {back(currentChannel?.title || "Articles", "articles")}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ArticleView
              article={article}
              starArticle={updateStarStatus}
              hideChannelCol={hideChannelCol}
              onOpenNote={openNote}
            />
          </div>
        </>
      );
    } else if (mobilePane === "articles" || mobilePane === "article") {
      pane = (
        <>
          {back("Channels", "channels")}
          <div className="flex-1 min-h-0 p-1 overflow-x-hidden overflow-y-auto">
            <Channel
              channel={currentChannel}
              starChannel={starChannel}
              articles={currentArticles}
              handleRefresh={handleRefresh}
              updateAllReadStatus={updateAllReadStatus}
              onClickArticle={onClickArticle}
              loading={loading}
              syncing={syncing}
              onOpenBook={openBook}
            />
          </div>
        </>
      );
    }
    return (
      <ErrorBoundary>
        <div className="flex flex-col h-full min-h-0" data-testid="feed-mobile">
          {pane}
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-row overflow-y-auto h-full">
        <div
          className={`relative flex-none border-r-2 border-base-300 ${hideCol ? "hidden" : ""}`}
          style={{ width: channelCol.width }}
        >
          <div className="h-full p-1 overflow-hidden">
            <ChannelList
              channelList={channelList}
              refreshList={refreshList}
              onShowManager={onShowManager}
              onClickFeed={onClickFeed}
              onClickStar={onClickStar}
              refreshing={refreshing}
              doneNum={doneNum}
            />
          </div>
          <ResizeHandle
            width={channelCol.width}
            bounds={FEED_CHANNEL_WIDTH}
            label="Resize channel list"
            onResize={channelCol.onResize}
            onResizeEnd={channelCol.onResizeEnd}
          />
        </div>
        {showManager ? (
          <div className="flex-1 m-1 p-2 overflow-y-auto">
            <FeedManager
              channelList={channelList}
              handleAddFeed={handleAddFeed}
              handleDelete={handleDeleteFeed}
            />
          </div>
        ) : currentCatalog ? (
          <div className="flex-1 min-w-0 p-1">
            <OpdsBrowser
              key={currentCatalog.link}
              channel={currentCatalog}
              onOpenBook={openBook}
            />
          </div>
        ) : (
          <>
            <div
              className={`relative flex-none ${isHideChannel ? "hidden" : ""}`}
              style={{ width: articleCol.width }}
            >
              <div className="h-full p-1 overflow-x-hidden overflow-y-auto">
                <Channel
                  channel={currentChannel}
                  starChannel={starChannel}
                  articles={currentArticles}
                  handleRefresh={handleRefresh}
                  updateAllReadStatus={updateAllReadStatus}
                  onClickArticle={onClickArticle}
                  loading={loading}
                  syncing={syncing}
                  onOpenBook={openBook}
                />
              </div>
              <ResizeHandle
                width={articleCol.width}
                bounds={FEED_ARTICLE_WIDTH}
                label="Resize article list"
                onResize={articleCol.onResize}
                onResizeEnd={articleCol.onResizeEnd}
              />
            </div>
            <div className="flex-1 overflow-y-auto border-l-2 border-base-300">
              <ArticleView
                article={currentArticle || storeArticle}
                starArticle={updateStarStatus}
                hideChannelCol={hideChannelCol}
                onOpenNote={openNote}
              />
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
