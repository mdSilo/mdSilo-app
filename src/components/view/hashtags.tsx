import ErrorBoundary from 'components/misc/ErrorBoundary';
import { useCurrentViewContext } from 'context/useCurrentView';
import { SearchTree } from 'components/sidebar/SidebarSearch';

export default function HashTags() {
  const className = '';
  const currentView = useCurrentViewContext();
  const tag = currentView.state.tag || '';

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-y-auto p-8 ${className}`}>
        <b className="text-3xl font-semibold border-none p-1 text-black dark:text-white">
          {`#${tag}`}
        </b>
        <SearchTree keyword={tag} ty="hashtag" />
      </div>
    </ErrorBoundary>
  );
}
