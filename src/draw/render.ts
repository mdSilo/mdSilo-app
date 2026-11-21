import "./assetPath";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { svgOfScene } from "./save";

/**
 * A scene given as text (e.g. by a plugin), checked and completed as
 * Excalidraw restores a file: the text to save, and its picture. Loads
 * Excalidraw (big): only when asked.
 */
export async function renderScene(
  text: string,
): Promise<{ scene: string; svg: string }> {
  let data: {
    type?: unknown;
    elements?: unknown;
    appState?: Partial<AppState>;
    files?: BinaryFiles;
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error("The scene is not JSON");
  }
  if (data?.type !== "excalidraw" || !Array.isArray(data.elements))
    throw new Error('A scene is { type: "excalidraw", elements: [...] }');
  const ex = await import("@excalidraw/excalidraw");
  // full elements (as Excalidraw saves them) restored; skeletons
  // ({ type, x, y, text, label… }) made whole, on top, their ids kept
  const isFull = (e: unknown) => {
    const el = e as { seed?: unknown; version?: unknown };
    return typeof el?.seed === "number" && typeof el?.version === "number";
  };
  const full = data.elements.filter(isFull);
  const skeletons = data.elements.filter((e) => !isFull(e));
  const elements = ex.restoreElements(
    [
      ...(full as Parameters<typeof ex.restoreElements>[0] & unknown[]),
      ...ex.convertToExcalidrawElements(
        skeletons as Parameters<typeof ex.convertToExcalidrawElements>[0],
        { regenerateIds: false },
      ),
    ],
    null,
    { refreshDimensions: true, repairBindings: true },
  );
  const appState = {
    viewBackgroundColor: "#ffffff",
    ...(data.appState ?? {}),
  } as AppState;
  const files = data.files ?? {};
  const svg = await svgOfScene(
    {
      serializeAsJSON: ex.serializeAsJSON,
      exportScene: ex.exportScene,
      getSceneVersion: ex.getSceneVersion,
    },
    { elements, appState, files },
  );
  return {
    scene: `${ex.serializeAsJSON(elements, appState, files, "local")}\n`,
    svg,
  };
}
