import "@/lib/polyfills";
import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "@/App";
import { bookWindowParams, drawingWindowParams } from "@/state/windowKind";
import { initI18n } from "@/i18n";

// a window of one book, see shell/windows
const BookWindow = lazy(() => import("@/shell/BookWindow"));
const book = bookWindowParams();
// ... of one drawing, see draw/window
const DrawWindow = lazy(() => import("@/draw/DrawWindow"));
const drawing = drawingWindowParams();

const root = document.getElementById("root");

// the language last used, not to show English first
const render = (root: HTMLElement) =>
  createRoot(root).render(
    <React.StrictMode>
      {book ? (
        <Suspense fallback={null}>
          <BookWindow {...book} />
        </Suspense>
      ) : drawing ? (
        <Suspense fallback={null}>
          <DrawWindow {...drawing} />
        </Suspense>
      ) : (
        <App />
      )}
    </React.StrictMode>,
  );

if (root) {
  void initI18n().finally(() => render(root));
}
