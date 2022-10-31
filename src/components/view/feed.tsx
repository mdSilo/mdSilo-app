import { useEffect, useState } from 'react';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { ChannelList } from 'components/reader/ChannelList';
import { Channel } from 'components/reader/Channel';
import { ArticleView } from 'components/reader/ArticleView';
import { ArticleType, ChannelType } from 'components/reader/helpers/dataType';
import * as dataAgent from 'components/reader/helpers/dataAgent';

export default function Feed() {
  // add data and handle dispatched here
  // channel list
  const [channelList, setChannelList] = useState<ChannelType[]>([]);
  const [currentChannel, setCurrentChannel] = useState<ChannelType | null>(null);
  const [currentArticle, setCurrentArticle] = useState<ArticleType | null>(null);

  const getList = () => {
    Promise.all([
      dataAgent.getChannels(),
      dataAgent.getUnreadTotal(),
    ]).then(([channels, unreadTotal]) => {
      channels.forEach((item) => {
        item.unread = unreadTotal[item.link] || 0;
      });

      setChannelList(channels);
    })
  };

  useEffect(() => {
    getList();
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [doneNum, setDoneNum] = useState(0);
  const loadAndUpdate = async (url: string) => {
    const res = await dataAgent.addChannel(url);
    setDoneNum((done) => done + 1);
    return res;
  };

  const refreshList = () => {
    setRefreshing(true);

    const urlList = channelList.map(channel => channel.link);
    // TODO, refresh 
    urlList.forEach(async url => await loadAndUpdate(url));
  };

  const onClickFeed = (link: string) => {
    const clieckedChannel = channelList.find(c => c.link === link);
    if (clieckedChannel) setCurrentChannel(clieckedChannel);
  };

  const addFeed = () => {
    // todo
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
      <div className="flex flex-1 flex-col flex-shrink-0">
        <div className="w-64">
          <ChannelList 
            channelList={channelList} 
            refreshList={refreshList} 
            onClickFeed={onClickFeed}
            refreshing={refreshing}
            doneNum={doneNum}
          />
        </div>
        <div className="w-96">
          {currentChannel && (
            <Channel 
              currentFeed={currentChannel} 
              handleRefresh={handleRefresh}
              markAllRead={markAllRead}
              onClickArticle={onClickArticle}
              syncing={syncing}
            />
          )}
        </div>
        <div className="my-1 p-1 rounded text-center">
          {currentArticle && (
            <ArticleView article={currentArticle} />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
