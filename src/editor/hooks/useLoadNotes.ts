import { useEffect } from 'react';
import { useStore } from 'lib/store';
import { loadDir } from 'file/open';

/**
 * Load all the notes of the workspace with content, for views needing them
 * all (graph, chronicle, backlinks, tasks...): once, shared by all of them.
 * @returns the notes are loaded
 */
export default function useLoadNotes(): boolean {
  const isLoaded = useStore((state) => state.isLoaded);
  const initDir = useStore((state) => state.initDir);
  useEffect(() => {
    if (!isLoaded && initDir) {
      void loadDir(initDir);
    }
  }, [initDir, isLoaded]);
  return isLoaded;
}
