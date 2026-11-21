import "./assetPath";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  MainMenu,
  exportScene,
  getSceneVersion,
  serializeAsJSON,
  serializeLibraryAsJSON,
  useHandleLibrary,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
// exported for the development and production conditions only, which
// the import resolver of eslint does not use; vite resolves it
// eslint-disable-next-line import/no-unresolved
import "@excalidraw/excalidraw/index.css";
import { useStore } from "@/state/store";
import { getLocale, useT } from "@/i18n";
import { Spinner } from "@/ui/ui";
import { QUOTE_MIME } from "@/writer/beside";
import useLinkHandlers from "@/writer/hooks/useLinkHandlers";
import { drawingName, readDrawing } from "./drawing";
import { quoteOfMarkdown } from "./quote";
import { libraryAdapter } from "./library";
import DrawingName from "./DrawingName";
import { DrawingSaver, useDrawingReloads, type SaveApi } from "./save";
import { shareDrawingSaved } from "./window";

const SAVE_API: SaveApi = { serializeAsJSON, exportScene, getSceneVersion };

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

/** A quote of a book dropped on the canvas: a text there, linked to the book. */
async function dropQuote(
  api: ExcalidrawImperativeAPI,
  md: string,
  at: { clientX: number; clientY: number },
) {
  const { text, link } = quoteOfMarkdown(md);
  if (!text) return;
  const { x, y } = viewportCoordsToSceneCoords(at, api.getAppState());
  // measured in its font, not a fallback: else cut once the font shows
  await document.fonts?.load("20px Excalifont", text).catch(() => undefined);
  const [element] = convertToExcalidrawElements([
    { type: "text", x, y, text, ...(link ? { link } : {}) },
  ]);
  api.updateScene({
    elements: [...api.getSceneElements(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/**
 * The canvas of a drawing: Excalidraw, saving to the drawing and its picture
 * as it is drawn on (see save.ts).
 */
export default function DrawCanvas({ path, lead, actions }: Props) {
  const t = useT();
  // written under the canvas (e.g. by a plugin): loaded again
  const reloads = useDrawingReloads((s) => s.seq);
  const darkMode = useStore((s) => s.darkMode);
  const [initial, setInitial] = useState<
    ExcalidrawInitialDataState | undefined
  >();
  const [error, setError] = useState("");
  const saver = useMemo(
    () => new DrawingSaver(SAVE_API, path, 500, shareDrawingSaved),
    [path],
  );
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  // the shape library of the workspace: loaded once ready, saved on change
  const [readyApi, setReadyApi] = useState<ExcalidrawImperativeAPI | null>(
    null,
  );
  const ws = useStore((s) => s.initDir);
  const adapter = useMemo(
    () => libraryAdapter(serializeLibraryAsJSON, ws),
    [ws],
  );
  useHandleLibrary({ excalidrawAPI: readyApi, adapter });
  // the links of the elements: notes, books, issues as in a note
  const { onOpenLink } = useLinkHandlers();
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
  }, [path, t, reloads]);

  // closed, or another drawing opened: the change waiting is saved
  useEffect(() => () => void saver.close(), [saver]);

  return (
    <div
      className="flex flex-col flex-1 min-w-0 min-h-0 bg-base-100"
      data-testid="draw-canvas"
    >
      <div className="flex items-center gap-1 px-2 py-1 border-b border-base-300">
        {lead}
        <DrawingName path={path} />
        {actions}
      </div>
      <div
        className="relative flex-1 min-h-0"
        onDragOverCapture={(e) => {
          if (e.dataTransfer.types.includes(QUOTE_MIME)) e.preventDefault();
        }}
        onDropCapture={(e) => {
          if (!api.current || !e.dataTransfer.types.includes(QUOTE_MIME))
            return;
          // the quote, not its markdown as text: Excalidraw does not see it
          e.preventDefault();
          e.stopPropagation();
          void dropQuote(api.current, e.dataTransfer.getData(QUOTE_MIME), {
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }}
      >
        {error ? (
          <p className="p-4 text-error">
            {t("Can't open the drawing: {error}", { error })}
          </p>
        ) : initial ? (
          <Excalidraw
            key={`${path}#${reloads}`}
            initialData={initial}
            name={drawingName(path)}
            theme={darkMode ? "dark" : "light"}
            langCode={LANG_CODES[getLocale()] ?? "en"}
            onExcalidrawAPI={(ready) => {
              api.current = ready;
              setReadyApi(ready);
            }}
            onLinkOpen={(element, event) => {
              if (!element.link) return;
              // opened by the app: in it, or in the browser for a URL
              event.preventDefault();
              void onOpenLink(element.link);
            }}
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
          >
            {/* the default menu, without the links to Excalidraw's sites */}
            <MainMenu>
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  );
}
