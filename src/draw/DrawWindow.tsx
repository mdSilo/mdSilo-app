import { lazy, Suspense, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@/styles/styles.css";
import "tippy.js/dist/tippy.css";
import useTheme from "@/lib/hooks/useTheme";
import { useLanguage } from "@/i18n/useLanguage";
import { useCustomFonts } from "@/custom/fonts";
import { useCustomThemes } from "@/custom/themes";
import { onStoreHydrated, store } from "@/state/store";
import type { DrawingWindowParams } from "@/state/windowKind";
import { ProvideCurrentView } from "@/state/useCurrentView";
import { showInMain } from "@/shell/windows";
import { loadDir } from "@/workspace/open";
import { hasWindows, shareSettings } from "@/state/windowSync";
import { resolveLayout } from "@/workspace/layout";
import { flushSave } from "@/workspace/pendingSaves";
import { Spinner } from "@/ui/ui";
import ErrorBoundary from "@/ui/ErrorBoundary";
import { onRenamed } from "@/workspace/renames";
import { movedPath, normalizeSlash, setWindowTitle } from "@/workspace/util";
import { flushDrawings } from "./save";
import { drawingName } from "./drawing";

const DrawCanvas = lazy(() => import("./DrawCanvas"));

/**
 * A window of one drawing (see window.ts): the canvas only. The views its
 * links ask for show in the main window.
 */
export default function DrawWindow(props: DrawingWindowParams) {
  const { ws } = props;
  // renamed (here, from its bar, or elsewhere): followed
  const [path, setPath] = useState(props.path);
  useEffect(
    () =>
      onRenamed(({ from, to }) =>
        setPath((now) => movedPath(normalizeSlash(now), from, to) ?? now),
      ),
    [],
  );
  useEffect(() => {
    setWindowTitle(`${drawingName(path)} - mdSilo`);
  }, [path]);
  useTheme();
  useLanguage();
  useCustomFonts();
  useCustomThemes();
  useEffect(() => shareSettings(), []);
  const [ready, setReady] = useState(false);

  // the workspace of the drawing, once the settings are read (the theme)
  useEffect(() => {
    let cancelled = false;
    const stop = onStoreHydrated(() => {
      void resolveLayout(ws)
        .then((layout) => {
          if (cancelled) return;
          store.getState().setLayout(layout);
          store.getState().setInitDir(ws);
          setReady(true);
          // the notes, for the links of the drawing to them
          void loadDir(ws);
        })
        .catch((e) =>
          console.error("Failed to open the workspace of the drawing:", e),
        );
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [ws]);

  // closing the window leaves no time to unmount: saved first
  useEffect(() => {
    if (!hasWindows) return;
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      try {
        await flushDrawings();
        await flushSave();
      } catch (e) {
        console.error("Failed to save before closing:", e);
      }
    });
    return () => void unlisten.then((off) => off());
  }, []);

  const loading = (
    <div className="flex items-center justify-center w-full h-full">
      <Spinner />
    </div>
  );
  return (
    <ProvideCurrentView route={showInMain}>
      <div id="app-container" className="flex h-screen bg-base-100">
        <ErrorBoundary>
          {ready ? (
            <Suspense fallback={loading}>
              <DrawCanvas path={path} />
            </Suspense>
          ) : (
            loading
          )}
        </ErrorBoundary>
      </div>
    </ProvideCurrentView>
  );
}
