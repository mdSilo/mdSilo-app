import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "@/state/store";
import { openUrl } from "@/workspace/open";
import { playRecording } from "./audio";
import { adaptToDark, pageBackground, type Rgb } from "./contrast";
import { dictionaryFile, type LocalDictionary } from "./local";
import {
  mdictAudioRef,
  openDictionary,
  resourceUrl,
  type OpenedDictionary,
} from "./mdict";

/**
 * An entry of a dictionary file, in a shadow root: its own styles (of its
 * .css files and of its .mdd) apply to it only, and the app's not to it.
 * Its pictures are read from the .mdd; a click on a sound plays it, on
 * another entry looks that word up.
 */

// the box of the entry: what is fixed in it stays in it
const BASE_CSS = `
:host { display: block; contain: paint; color: inherit; font-size: inherit; }
.mdict-entry { overflow-wrap: anywhere; }
.mdict-entry img { max-width: 100%; height: auto; }
[data-mdict-sound], [data-mdict-entry], [data-mdict-anchor] { cursor: pointer; }
`;

/** The page of a dark theme, if the popup's cannot be told. */
const DARK_PAGE: Rgb = { r: 29, g: 35, b: 42, a: 1 };

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]+?))\s*\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** A style sheet with the files it links to (`url(…)`) from the .mdd, as blob urls. */
async function withResources(
  css: string,
  mdds: OpenedDictionary["mdds"],
  urls: string[],
): Promise<string> {
  if (!mdds.length || !css.includes("url(")) return css;
  const paths = new Set<string>();
  for (const m of css.matchAll(CSS_URL)) {
    const path = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (path && !EXTERNAL.test(path)) paths.add(path);
  }
  const found = new Map<string, string>();
  await Promise.all(
    [...paths].map(async (path) => {
      const url = await resourceUrl(mdds, path);
      if (url) {
        urls.push(url);
        found.set(path, url);
      }
    }),
  );
  return css.replace(CSS_URL, (all, dq, sq, bare) => {
    const url = found.get(String(dq ?? sq ?? bare ?? "").trim());
    return url ? `url("${url}")` : all;
  });
}

/** The style sheets of a dictionary: its .css files, and those the entry links to in the .mdd. */
async function stylesOf(
  ws: string,
  dict: LocalDictionary,
  opened: OpenedDictionary,
  linked: string[],
  urls: string[],
): Promise<string> {
  const files = await Promise.all(
    (dict.files.css ?? []).map((name) =>
      invoke<string>("read_file", {
        filePath: dictionaryFile(ws, dict.id, name),
      }).catch(() => ""),
    ),
  );
  const fromMdd = await Promise.all(
    linked.map(async (path) => {
      const url = await resourceUrl(opened.mdds, path);
      if (!url) return "";
      try {
        return await (await fetch(url)).text();
      } finally {
        URL.revokeObjectURL(url);
      }
    }),
  );
  // the style sheet as text, in <style>: no closing it early
  const css = [...files, ...fromMdd].join("\n").replace(/<\/style/gi, "");
  return withResources(css, opened.mdds, urls);
}

export default function MdictEntry({
  ws,
  dict,
  html,
  styles,
  onNavigate,
}: {
  ws: string;
  dict: LocalDictionary;
  /** sanitized, see prepareEntry */
  html: string;
  styles?: string[];
  /** look another word up: a link to its entry clicked */
  onNavigate: (word: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // a sound clicked that could not be played: why
  const [error, setError] = useState("");
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;
  // a dark theme: the colors of the dictionary (for a white page) made readable
  const dark = useStore((state) => state.darkMode);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    let cancelled = false;
    const urls: string[] = [];
    root.innerHTML = `<style>${BASE_CSS}</style><style data-dict></style><div class="mdict-entry">${html}</div>`;

    const entry = root.querySelector(".mdict-entry");
    const adapt = () => {
      if (dark && entry && !cancelled)
        adaptToDark(entry, pageBackground(host) ?? DARK_PAGE);
    };

    void (async () => {
      const opened = await openDictionary(ws, dict).catch(() => undefined);
      if (!opened || cancelled) {
        adapt();
        return;
      }
      const css = await stylesOf(ws, dict, opened, styles ?? [], urls);
      const sheet = root.querySelector("style[data-dict]");
      if (!cancelled && sheet) sheet.textContent = css;
      // with the styles of the dictionary applied
      adapt();
      const imgs = [
        ...root.querySelectorAll<HTMLImageElement>("img[data-mdict-src]"),
      ];
      await Promise.all(
        imgs.map(async (img) => {
          const url = await resourceUrl(
            opened.mdds,
            img.getAttribute("data-mdict-src") ?? "",
          );
          if (!url) return;
          urls.push(url);
          if (!cancelled) img.src = url;
        }),
      );
      if (cancelled) urls.forEach((u) => URL.revokeObjectURL(u));
    })();

    const onClick = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(
        "[data-mdict-sound], [data-mdict-entry], [data-mdict-anchor], a[href]",
      );
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const sound = el.getAttribute("data-mdict-sound");
      const entry = el.getAttribute("data-mdict-entry");
      const anchor = el.getAttribute("data-mdict-anchor");
      if (sound) {
        setError("");
        playRecording(mdictAudioRef(dict.id, sound)).catch((e: unknown) =>
          setError(e instanceof Error ? e.message : String(e)),
        );
      } else if (entry) navigate.current(entry);
      else if (anchor) {
        const target =
          root.getElementById?.(anchor) ??
          [...root.querySelectorAll("a[name]")].find(
            (a) => a.getAttribute("name") === anchor,
          );
        target?.scrollIntoView?.({ block: "start" });
      } else {
        const href = el.getAttribute("href") ?? "";
        if (/^https?:\/\//i.test(href)) void openUrl(href);
      }
    };
    root.addEventListener("click", onClick);
    return () => {
      cancelled = true;
      root.removeEventListener("click", onClick);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ws, dict, html, styles, dark]);

  return (
    <>
      <div ref={hostRef} data-testid="mdict-entry" />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-error">
          {error}
        </p>
      ) : null}
    </>
  );
}
