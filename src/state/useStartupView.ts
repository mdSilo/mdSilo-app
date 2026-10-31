import { useEffect, useRef } from 'react';
import { onStoreHydrated, SidebarTab, store } from '@/state/store';
import { useCurrentViewContext } from './useCurrentView';

/** the startup views of a folder, shown once it is open */
const FOLDER_VIEWS = ['library', 'book', 'issues', 'project', 'chronicle', 'graph', 'journal'] as const;
type FolderView = typeof FOLDER_VIEWS[number];
const isFolderView = (view: string): view is FolderView =>
  (FOLDER_VIEWS as readonly string[]).includes(view);

/**
 * Show the view of the setting `startupView` once on startup. The views of a
 * folder wait for the folder to open (the library and the last book: a
 * workspace), and are not shown if the user went to another view meanwhile.
 * With no book read yet in the workspace, the last book is the library.
 */
export default function useStartupView() {
  const { state, dispatch } = useCurrentViewContext();
  const viewRef = useRef(state.view);
  viewRef.current = state.view;

  useEffect(() => {
    let unsubscribe = () => {};
    const stopHydrated = onStoreHydrated(() => {
      const view = store.getState().startupView;
      if (view === 'feed') {
        store.getState().setIsSidebarOpen(false);
        dispatch({ view: 'feed' });
        return;
      }
      if (!isFolderView(view)) {
        store.getState().setSidebarTab(SidebarTab.Silo);
        return;
      }
      const show = () => {
        const { initDir, layout, lastBooks } = store.getState();
        if (!initDir) return false;
        const available = (view !== 'library' && view !== 'book') || layout === 'workspace';
        if (!available || viewRef.current !== 'default') return true;
        if (view !== 'book') dispatch({ view });
        else {
          const path = lastBooks[initDir];
          dispatch(path ? { view: 'book', path } : { view: 'library' });
        }
        return true;
      };
      if (show()) return;
      unsubscribe = store.subscribe(() => {
        if (show()) unsubscribe();
      });
    });
    return () => {
      stopHydrated();
      unsubscribe();
    };
  }, [dispatch]);
}
