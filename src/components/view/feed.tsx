import ErrorBoundary from 'components/misc/ErrorBoundary';
import { ChannelList } from 'components/reader/ChannelList';
import { Channel } from 'components/reader/Channel';
import { ArticleView } from 'components/reader/ArticleView';

export default function Feed() {
  // add data and handle dispatched from here
  // feedlist = [];
  // currentChannel and it's article list
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
          <ChannelList />
        </div>
        <div className="w-96">
          <Channel />
        </div>
        <div className="my-1 p-1 rounded text-center">
          <ArticleView />
        </div>
      </div>
    </ErrorBoundary>
  );
}
