import { useEffect, useState } from 'react';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { ChannelList } from 'components/feed/ChannelList';
import { Channel } from 'components/feed/Channel';
import { ArticleView } from 'components/feed/ArticleView';
import { FeedManager } from 'components/feed/FeedManager';
import { ArticleType, ChannelType } from 'components/feed/data/dataType';
import * as dataAgent from 'components/feed/data/dataAgent';

export default function Feed() {
  // add data and handle dispatched here
  // channel list
  const [channelList, setChannelList] = useState<ChannelType[]>([]);
  const [currentChannel, setCurrentChannel] = useState<ChannelType | null>(null);
  const [currentArticles, setCurrentArticles] = useState<ArticleType[] | null>(null);
  const [currentArticle, setCurrentArticle] = useState<ArticleType | null>(null);
  const [showManager, setShowManager] = useState(false);

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
  const refreshChannel = async (link: string, title: string) => {
    const res = await dataAgent.addChannel(link, title);
    setDoneNum((done) => done + 1);
    return res;
  };

  const refreshList = () => {
    setRefreshing(true);
    channelList.forEach(async c => await refreshChannel(c.link, c.title));
  };

  const onShowManager = () => {
    setShowManager(!showManager);
  };

  const getArticleList = async (link: string) => {
    
    const articles = await dataAgent.getArticleList(link, null);
    console.log("current articles", articles, currentArticles);
    setCurrentArticles(articles);
  };

  const onClickFeed = async (link: string) => {
    const clickedChannel = channelList.find(c => c.link === link);
    if (clickedChannel) {
      setCurrentChannel(clickedChannel);
      setShowManager(false);
      await getArticleList(clickedChannel.link);
    } 
  };

  const handleAddFeed = async (feedUrl: string, title: string) => {
    const res = await dataAgent.addChannel(feedUrl, title)
    if (res > 0) {
      getList();
    }
  };

  const handleDeleteFeed = async (channel: ChannelType) => {
    if (channel && channel.link) {
      await dataAgent.deleteChannel(channel.link)
      getList()
    }
  };

  // currentChannel and it's article list
  const [syncing, setSyncing] = useState(false);
  const handleRefresh = () => {
    // TODO
    setSyncing(true);
  };

  const markAllRead = () => {
    // TODO
  };

  const onClickArticle = (article: ArticleType) => {
    setCurrentArticle(article);
  };

  // cuurent article
  
  // handle add channel and refresh all channel
  // handle refresh channel and update read_status and unread_num 
  // view article and update read-status and unread_num 
  // handle minimize sub-window
  // handle star article 

  return (
    <ErrorBoundary>
      <div className="flex flex-row flex-shrink-0">
        <div className="w-52 p-1 border-r-2 border-gray-500">
          <ChannelList 
            channelList={channelList} 
            refreshList={refreshList} 
            onShowManager={onShowManager} 
            onClickFeed={onClickFeed}
            refreshing={refreshing}
            doneNum={doneNum}
          />
        </div>
        {showManager ? (
          <FeedManager 
            channelList={channelList} 
            handleAddFeed={handleAddFeed}
            handleDelete={handleDeleteFeed}
          />
        ) : (
          <div className="flex">
            <div className="w-64 p-1 border-r-2 border-gray-500">
              <Channel 
                channel={currentChannel} 
                articles={currentArticles}
                handleRefresh={handleRefresh}
                markAllRead={markAllRead}
                onClickArticle={onClickArticle}
                syncing={syncing}
              />
            </div>
            <div className="my-1 p-1 rounded text-center">
              <ArticleView article={currentArticle} />
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
