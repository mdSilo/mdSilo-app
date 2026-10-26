import { useEffect } from 'react';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import ForceGraph from 'components/view/ForceGraph';
import { useStore } from 'lib/store';
import { loadDir } from 'file/open';

export default function Graph() {
  const isLoaded = useStore((state) => state.isLoaded);
  const initDir = useStore((state) => state.initDir);
  // console.log("g loaded?", isLoaded);
  useEffect(() => {
    if (!isLoaded && initDir) {
      void loadDir(initDir);
    }
  }, [initDir, isLoaded]);

  return (
    <ErrorBoundary>
      <ForceGraph className="flex-1" />
    </ErrorBoundary>
  );
}
