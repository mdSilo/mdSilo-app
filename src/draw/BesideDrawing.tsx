import { lazy, Suspense } from "react";
import { TbAppWindow, TbArrowsMaximize, TbX } from "react-icons/tb";
import { useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import useIsMobile from "@/lib/hooks/useIsMobile";
import { besideStyle, useBesideWidth } from "@/ui/SplitHandle";
import ErrorBoundary from "@/ui/ErrorBoundary";
import { Spinner } from "@/ui/ui";
import { useT } from "@/i18n";
import { closeBesideDrawing, expandBesideDrawing } from "./open";
import { canOpenDrawingWindow, openDrawingWindow } from "./window";
import InsertDrawingButton from "./InsertDrawingButton";

// Excalidraw is big: loaded once a drawing opens
const DrawCanvas = lazy(() => import("./DrawCanvas"));

const btn = "btn btn-ghost btn-xs btn-square";

/**
 * The drawing beside the note or book shown; over it, the whole page, on a
 * phone (see open.ts).
 */
export default function BesideDrawing() {
  const t = useT();
  const path = useStore((s) => s.besideDrawing);
  const width = useBesideWidth();
  const mobile = useIsMobile();
  const { dispatch } = useCurrentViewContext();
  if (!path) return null;

  const actions = (
    <>
      <InsertDrawingButton path={path} className={btn} />
      {mobile ? null : (
        <button
          className={btn}
          title={t("Open alone")}
          aria-label={t("Open alone")}
          onClick={() => expandBesideDrawing(dispatch)}
        >
          <TbArrowsMaximize size={16} />
        </button>
      )}
      {canOpenDrawingWindow ? (
        <button
          className={btn}
          title={t("Open in a window")}
          aria-label={t("Open in a window")}
          onClick={() => {
            closeBesideDrawing(true);
            openDrawingWindow(path);
          }}
        >
          <TbAppWindow size={16} />
        </button>
      ) : null}
      <button
        className={btn}
        title={t("Close")}
        aria-label={t("Close")}
        onClick={() => closeBesideDrawing(true)}
      >
        <TbX size={16} />
      </button>
    </>
  );

  return (
    <div
      className={
        mobile
          ? "fixed inset-0 z-40 flex bg-base-100"
          : "flex min-w-0 border-l border-base-300"
      }
      style={mobile ? undefined : besideStyle(width)}
      data-testid="beside-drawing"
    >
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex items-center justify-center w-full h-full">
              <Spinner />
            </div>
          }
        >
          <DrawCanvas key={path} path={path} actions={actions} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
