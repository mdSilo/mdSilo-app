import { lazy, Suspense, useEffect, useMemo } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import '@/styles/styles.css';
import 'tippy.js/dist/tippy.css';
import useTheme from '@/lib/hooks/useTheme';
import { useCustomFonts } from '@/custom/fonts';
import { useCustomThemes } from '@/custom/themes';
import { onStoreHydrated, store } from '@/state/store';
import { ProvideCurrentView, useCurrentViewContext } from '@/state/useCurrentView';
import type { BookWindowParams } from '@/state/windowKind';
import { hasWindows, shareSettings } from '@/state/windowSync';
import { resolveLayout } from '@/workspace/layout';
import { loadDir } from '@/workspace/open';
import { flushSave } from '@/workspace/pendingSaves';
import { issueStore } from '@/issue/issueStore';
import { useReaderStore, useSideStore } from '@/reader/readerStore';
import { stopTTS } from '@/reader/tts/tts';
import Player from '@/player/Player';
import { Spinner } from '@/ui/ui';
import { routeBook, useGotoInBookWindow } from './windows';

const Reader = lazy(() => import('@/reader/components/ReaderView'));

/**
 * A window of one book (see windows.ts): the reader and the player only. The
 * other views it asks for show in the main window.
 */
export default function BookWindow(props: BookWindowParams) {
  useTheme();
  useCustomFonts();
  useCustomThemes();
  const route = useMemo(() => routeBook(props.path), [props.path]);
  useEffect(() => shareSettings(), []);

  return (
    <ProvideCurrentView route={route}>
      <div id="app-container" className="h-screen flex flex-col">
        <div className="relative flex w-full h-full min-h-0 bg-base-100">
          <div className="relative flex flex-1 flex-col min-w-0">
            <BookView {...props} />
          </div>
          <Player />
        </div>
      </div>
    </ProvideCurrentView>
  );
}

function BookView({ path, ws, cfi }: BookWindowParams) {
  const { state, dispatch } = useCurrentViewContext();
  useGotoInBookWindow(path, dispatch);

  // the workspace of the book (for its annotations, the links to it), once
  // the settings are read: the book opens as set
  useEffect(() => {
    let cancelled = false;
    const stop = onStoreHydrated(() => {
      void resolveLayout(ws).then((layout) => {
        if (cancelled) return;
        store.getState().setLayout(layout);
        store.getState().setInitDir(ws);
        dispatch({ view: 'book', path, cfi });
        // the notes, for the links to the book
        void loadDir(ws);
      }).catch((e) => console.error('Failed to open the workspace of the book:', e));
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [ws, path, cfi, dispatch]);

  // closing the window leaves no time to unmount: saved first
  useEffect(() => {
    if (!hasWindows) return;
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      stopTTS();
      try {
        await Promise.all([useSideStore.getState().close(), useReaderStore.getState().close()]);
        await Promise.all([issueStore.getState().flush(), flushSave()]);
      } catch (e) {
        console.error('Failed to save before closing:', e);
      }
    });
    return () => void unlisten.then((off) => off());
  }, []);

  const loading = (
    <div className="flex items-center justify-center w-full h-full"><Spinner /></div>
  );
  return state.view === 'book' ? <Suspense fallback={loading}><Reader /></Suspense> : loading;
}
