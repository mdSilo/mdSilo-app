import { useEffect, useState } from 'react';
import { store, useStore } from 'lib/store';
import { ArticleType, ChannelType } from 'types/model';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { ChannelList } from 'components/feed/ChannelList';
import { Channel } from 'components/feed/Channel';
import { ArticleView } from 'components/feed/ArticleView';
import { FeedManager } from 'components/feed/FeedManager';
import * as dataAgent from 'components/feed/dataAgent';

export default function Feed() {
  // channel list
  const [channelList, setChannelList] = useState<ChannelType[]>([]);
  const [currentChannel, setCurrentChannel] = useState<ChannelType | null>(null);
  const [currentArticles, setCurrentArticles] = useState<ArticleType[] | null>(null);
  const [currentArticle, setCurrentArticle] = useState<ArticleType | null>(null);
  const [starChannel, setStarChannel] = useState(false);
  const [showManager, setShowManager] = useState(false);

  const storeArticle = useStore(state => state.currentArticle);

  const getList = () => {
    Promise.all(
      [dataAgent.getChannels(), dataAgent.getUnreadNum()]
    ).then(([channels, unreadNum]) => {
      channels.forEach((item) => {
        item.unread = unreadNum[item.link] || 0;
      });

      setChannelList(channels);
    })
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
    for (const channel of channelList) {
      await refreshChannel(channel.link, channel.ty, channel.title);
      setDoneNum(doneNum + 1);
    }
    setRefreshing(false);
  };

  const onShowManager = () => {
    setShowManager(!showManager);
  };

  const loadArticleList = async (link: string) => {
    const articles = await dataAgent.getArticleList(link, null, null);
    // console.log("current articles", articles, currentArticles);
    setCurrentArticles(articles);
  };

  const [loading, setLoading] = useState(false);
  const onClickFeed = async (link: string) => {
    setLoading(true);
    const clickedChannel = channelList.find(c => c.link === link);
    if (clickedChannel) {
      setCurrentChannel(clickedChannel);
      setShowManager(false);
      await loadArticleList(clickedChannel.link);
    } 
    setLoading(false);
  };

  const onClickStar = async () => {
    setLoading(true);
    setCurrentChannel(null);
    setCurrentArticles(null);
    setStarChannel(true);
    setShowManager(false);
    const starArticles = await dataAgent.getArticleList(null, null, 1);
    setCurrentArticles(starArticles);
    setLoading(false);
  };

  const handleAddFeed = async (feedUrl: string, ty: string, title: string) => {
    const res = await dataAgent.addChannel(feedUrl, ty, title)
    if (res > 0) {
      getList();
    }
  };

  const handleDeleteFeed = async (channel: ChannelType) => {
    if (channel && channel.link) {
      await dataAgent.deleteChannel(channel.link);
      getList();
    }
  };

  // currentChannel and it's article list
  const [syncing, setSyncing] = useState(false);
  const handleRefresh = async () => {
    setSyncing(true);
    if (currentChannel) {
      // console.log("refresh current channel: ", currentChannel)
      await dataAgent.addChannel(currentChannel.link, currentChannel.ty, currentChannel.title);
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
    setHideCol(!hideCol);
  };
  const [isHideChannel, setIsHideChannel] = useState(false);
  useEffect(() => {
    setIsHideChannel(hideCol || !(currentArticles && currentArticles.length > 0));
  }, [currentArticles, hideCol]);

  return (
    <ErrorBoundary>
      <div className="flex flex-row overflow-y-auto h-full">
        <div className={`w-48 p-1 border-r-2 border-gray-200 dark:border-gray-800 overflow-y-auto ${hideCol ? 'hidden' : ''}`}>
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
        {showManager ? (
          <div className="flex-1 m-1 p-2 overflow-y-auto">
            <FeedManager 
              channelList={channelList} 
              handleAddFeed={handleAddFeed}
              handleDelete={handleDeleteFeed}
            />
          </div>
        ) : (
          <>
            <div className={`w-72 p-1 overflow-y-auto ${isHideChannel ? 'hidden' : ''}`}>
              <Channel 
                channel={currentChannel} 
                starChannel={starChannel} 
                articles={currentArticles}
                handleRefresh={handleRefresh}
                updateAllReadStatus={updateAllReadStatus}
                onClickArticle={onClickArticle}
                loading={loading}
                syncing={syncing}
              />
            </div>
            <div className="flex-1 overflow-y-auto border-l-2 border-gray-200 dark:border-gray-800">
              <ArticleView 
                article={currentArticle || storeArticle} 
                starArticle={updateStarStatus} 
                hideChannelCol={hideChannelCol}
              />
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
