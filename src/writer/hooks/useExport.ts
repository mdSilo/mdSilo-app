import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/workspace/util";
import { t } from "@/i18n";

/** the copy of the note that is printed, see `@media print` in styles.css */
export const PRINT_ROOT_ID = "print-root";

const noteContent = () => document.getElementById("note-content");

/**
 * Export the note as a PDF of text (selectable, searchable, with its links and
 * fonts), by the system print dialog: "Save as PDF" or "Print to File" there.
 * The note is copied out of the scrolling app into a page of its own, which is
 * all that is printed, so it runs on over as many pages as it needs.
 */
export async function exportPdf(title: string, dark: boolean) {
  const note = noteContent();
  if (!note) return;

  document.getElementById(PRINT_ROOT_ID)?.remove();
  const root = document.createElement("div");
  root.id = PRINT_ROOT_ID;
  // on paper, as the light theme; in a dark theme the editor's own colors are
  // light, so the text is printed in ink (print-ink in styles.css)
  root.setAttribute("data-theme", "mdsilo-light");
  if (dark) root.classList.add("print-ink");
  if (title) {
    const h = document.createElement("h1");
    h.className = "print-title";
    h.textContent = title;
    root.appendChild(h);
  }
  root.appendChild(await printCopy(note));
  document.body.appendChild(root);

  const cleanUp = () => root.remove();
  window.addEventListener("afterprint", cleanUp, { once: true });
  try {
    if (isTauri) {
      // window.print() does nothing in the macOS webview
      await invoke("print_page");
    } else {
      window.print();
    }
  } catch (e) {
    console.error("print", e);
    cleanUp();
  }
}

/** a copy of the note content, as it is shown, to be printed */
async function printCopy(note: HTMLElement) {
  const copy = note.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.querySelectorAll("[contenteditable]").forEach((el) => {
    el.setAttribute("contenteditable", "false");
  });

  // the pixels of a canvas are not copied with it
  const canvases = note.querySelectorAll("canvas");
  copy.querySelectorAll("canvas").forEach((c, i) => {
    const src = canvases[i];
    try {
      const img = document.createElement("img");
      img.src = src.toDataURL("image/png");
      img.style.width = `${src.clientWidth}px`;
      img.style.maxWidth = "100%";
      c.replaceWith(img);
    } catch {
      // a tainted canvas: left blank
    }
  });

  // the raw markdown editor (CodeMirror) only has the lines on the screen in
  // the page: all of its text, as it is
  const editors = note.querySelectorAll<HTMLElement>(".cm-editor");
  if (editors.length > 0) {
    const { EditorView } = await import("@codemirror/view");
    copy.querySelectorAll(".cm-editor").forEach((el, i) => {
      const view = EditorView.findFromDOM(editors[i]);
      if (!view) return;
      const pre = document.createElement("pre");
      pre.className = "print-raw";
      pre.textContent = view.state.doc.toString();
      el.replaceWith(pre);
    });
  }
  return copy;
}

// html2canvas is big: loaded on export, not on start

/** Export the note as a PNG image, the file name as the note's */
export async function exportPng(notePath: string) {
  const note = noteContent();
  if (!note) return;

  const filePath = notePath.replace(/\.[^./\\]*$/, "") + ".png";
  try {
    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = await html2canvas(note, {
      // the color of the page, not white under the light text of a dark theme
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      scale: window.devicePixelRatio || 1,
    });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("no image of the note");

    if (!isTauri) {
      download(blob, filePath.split(/[/\\]/).pop() || "note.png");
      return;
    }
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    const ok = await invoke<boolean>("download_file", {
      filePath,
      blob: bytes,
    });
    await invoke("msg_dialog", {
      title: t("Export"),
      msg: ok ? `Saved to ${filePath}` : `Failed to save ${filePath}`,
    });
  } catch (e) {
    console.error("export png", e);
    if (isTauri) {
      await invoke("msg_dialog", { title: t("Export"), msg: `Failed: ${e}` });
    }
  }
}

/** the browser's download of a file, on the web */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
