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
import { hasWindows, shareSettings } from "@/state/windowSync";
import { resolveLayout } from "@/workspace/layout";
import { flushSave } from "@/workspace/pendingSaves";
import { Spinner } from "@/ui/ui";
import ErrorBoundary from "@/ui/ErrorBoundary";
import { flushDrawings } from "./save";

const DrawCanvas = lazy(() => import("./DrawCanvas"));

/** A window of one drawing (see window.ts): the canvas only. */
export default function DrawWindow({ path, ws }: DrawingWindowParams) {
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
  );
}
