import { memo, useCallback, useState } from 'react';
import { IconHeadphones } from '@tabler/icons-react';
import { store, useStore } from 'lib/store';
import AudioPlayer from 'components/feed/AudioPlayer';
import * as dataAgent from 'components/feed/dataAgent';
import { useCurrentViewContext } from 'context/useCurrentView';

type Props = {
  className?: string;
};

function Statusbar(props: Props) {
  const { className = '' } = props; 

  const currentPod = useStore((state) => state.currentPod);
  const [hide, setHide] = useState(false);
  // console.log("current pod: ", currentPod)
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;
  const toArticle = useCallback(async (url: string) => {
    const article = await dataAgent.getArticleByUrl(url);
    if (article) { 
      store.getState().setCurrentArticle(article); 
      dispatch({view: 'feed'});
    }
  }, [dispatch])

  return (
    <div className={`flex items-center justify-between w-full bg-gray-50 dark:bg-gray-800 dark:text-white ${className}`}>
      <button className='mx-1' onClick={() => setHide(!hide)}>
        <IconHeadphones size={12} className="dark:text-slate-300" />
      </button>
      {currentPod && (
        <div className={`py-1 flex flex-row items-center justify-center ${hide ? 'hidden' : ''}`}>
          <span 
            className="mx-1 text-xs break-words cursor-pointer" 
            onClick={async () => await toArticle(currentPod.article_url)}
          >
            {currentPod.title}
          </span>
          <AudioPlayer currentPod={currentPod} className="mx-1 h-6" />
        </div>
      )}
    </div>
  );
}

export default memo(Statusbar);
