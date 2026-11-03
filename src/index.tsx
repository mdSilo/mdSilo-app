import "@/lib/polyfills";
import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "@/App";
import { bookWindowParams } from "@/state/windowKind";

// a window of one book, see shell/windows
const BookWindow = lazy(() => import("@/shell/BookWindow"));
const book = bookWindowParams();

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      {book ? (
        <Suspense fallback={null}>
          <BookWindow {...book} />
        </Suspense>
      ) : (
        <App />
      )}
    </React.StrictMode>,
  );
}
