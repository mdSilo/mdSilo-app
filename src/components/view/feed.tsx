import ErrorBoundary from 'components/misc/ErrorBoundary';
import { ChannelList } from 'components/reader/ChannelList';
import { ArticleContainer } from 'components/reader/AticleContainer';

export default function Feed() {
  return (
    <ErrorBoundary>
      <div className="flex flex-1 flex-col flex-shrink-0">
        <div className="w-64">
          <ChannelList />
        </div>
        <div className="my-1 p-1 rounded text-center">
          <ArticleContainer />
        </div>
      </div>
    </ErrorBoundary>
  );
}
