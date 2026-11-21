import "./assetPath";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Excalidraw,
  exportToSvg,
  getSceneVersion,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
// exported for the development and production conditions only, which
// the import resolver of eslint does not use; vite resolves it
// eslint-disable-next-line import/no-unresolved
import "@excalidraw/excalidraw/index.css";
import { useStore } from "@/state/store";
import { getLocale, useT } from "@/i18n";
import { Spinner } from "@/ui/ui";
import { drawingName, readDrawing } from "./drawing";
import { DrawingSaver, type SaveApi } from "./save";
import { shareDrawingSaved } from "./window";

const SAVE_API: SaveApi = { serializeAsJSON, exportToSvg, getSceneVersion };

/** the languages of the app, as Excalidraw names them */
const LANG_CODES: Record<string, string> = {
  en: "en",
  es: "es-ES",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
};

type Props = {
  /** the drawing file, `.excalidraw` */
  path: string;
  /** at the start of the bar above, e.g. the menu of the view */
  lead?: ReactNode;
  /** buttons of the bar above, e.g. insert into the note, close */
  actions?: ReactNode;
};

/**
 * The canvas of a drawing: Excalidraw, saving to the drawing and its picture
 * as it is drawn on (see save.ts).
 */
export default function DrawCanvas({ path, lead, actions }: Props) {
  const t = useT();
  const darkMode = useStore((s) => s.darkMode);
  const [initial, setInitial] = useState<
    ExcalidrawInitialDataState | undefined
  >();
  const [error, setError] = useState("");
  const saver = useMemo(
    () => new DrawingSaver(SAVE_API, path, 500, shareDrawingSaved),
    [path],
  );
  // the scene loaded, before Excalidraw gives its first change
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;
    ready.current = false;
    setInitial(undefined);
    setError("");
    readDrawing(path)
      .then((text) => {
        if (cancelled) return;
        const data = (text.trim() ? JSON.parse(text) : {}) as {
          type?: string;
        } & ExcalidrawInitialDataState;
        if (data.type && data.type !== "excalidraw")
          throw new Error(t("Not a drawing"));
        setInitial({
          elements: data.elements ?? [],
          appState: data.appState ?? {},
          files: data.files ?? {},
          scrollToContent: true,
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e instanceof Error ? e.message : e));
      });
    return () => {
      cancelled = true;
    };
  }, [path, t]);

  // closed, or another drawing opened: the change waiting is saved
  useEffect(() => () => void saver.close(), [saver]);

  return (
    <div
      className="flex flex-col flex-1 min-w-0 min-h-0 bg-base-100"
      data-testid="draw-canvas"
    >
      <div className="flex items-center gap-1 px-2 py-1 border-b border-base-300">
        {lead}
        <span
          className="flex-1 min-w-0 overflow-hidden text-sm text-ellipsis whitespace-nowrap"
          title={path}
        >
          {drawingName(path)}
        </span>
        {actions}
      </div>
      <div className="relative flex-1 min-h-0">
        {error ? (
          <p className="p-4 text-error">
            {t("Can't open the drawing: {error}", { error })}
          </p>
        ) : initial ? (
          <Excalidraw
            key={path}
            initialData={initial}
            name={drawingName(path)}
            theme={darkMode ? "dark" : "light"}
            langCode={LANG_CODES[getLocale()] ?? "en"}
            onChange={(elements, appState, files) => {
              const scene = { elements, appState, files };
              // the first change is the scene loaded
              if (!ready.current) {
                ready.current = true;
                saver.loaded(scene);
                return;
              }
              saver.change(scene);
            }}
            UIOptions={{
              canvasActions: {
                // the drawing is its file: no opening another one over it
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
              },
            }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  );
}
