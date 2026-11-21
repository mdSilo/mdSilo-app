import { useCurrentViewContext } from "@/state/useCurrentView";
import ViewMenu from "@/shell/ViewMenu";
import ErrorBoundary from "@/ui/ErrorBoundary";
import DrawCanvas from "./DrawCanvas";

/** A drawing shown alone, as the view (see draw/). */
export default function DrawView() {
  const { state } = useCurrentViewContext();
  const path = state.drawingPath ?? "";
  if (!path) return null;
  return (
    <ErrorBoundary>
      <div className="flex w-full h-full">
        <DrawCanvas path={path} lead={<ViewMenu />} />
      </div>
    </ErrorBoundary>
  );
}
