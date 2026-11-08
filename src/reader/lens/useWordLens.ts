import { useEffect, useMemo } from "react";
import { useStore } from "@/state/store";
import { baseLanguage, targetLanguage, translatorOf } from "../lookup/lookup";
import { readingArea } from "../area";
import { boxOfRange, usePopups } from "../popups";
import { storeOf } from "../readerStore";
import { withDefaults } from "../settings";
import { setActivePane, type FoliateView, type Pane } from "../view";
import { useVocabulary, type VocabularyEntry } from "../vocabulary/vocabulary";
import {
  applyLens,
  glossOf,
  LENS_CLASS,
  lexiconOf,
  rangeOfMarker,
  removeLens,
  type Lexicon,
} from "./lens";

/** translations asked at once, at most */
const CONCURRENT = 2;

// the words asked to be translated, by language: once each, while the app runs
const asked = new Set<string>();

/**
 * The word lens of a book: the words of the vocabulary with their glosses,
 * in the sections shown and each loaded after; again when the vocabulary or
 * the settings change. A gloss clicked shows the word in the dictionaries.
 * Glosses of translations: the words met not translated yet are, and kept
 * in the vocabulary. A fixed layout (PDF, comics) is not.
 */
export function useWordLens(view: FoliateView | null, pane: Pane) {
  const bookStore = storeOf(pane);
  const ws = bookStore((state) => state.ws);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const on = settings.wordLens;
  const target = targetLanguage(settings.translateTo);
  // translated to the language of the book itself: the definition is better
  const lang =
    settings.lensGloss === "translation" &&
    baseLanguage(target) !== baseLanguage(view?.language?.canonical)
      ? target
      : undefined;
  const translatorName = settings.translator;
  const entries = useVocabulary((state) => state.entries);
  const vocabularyWs = useVocabulary((state) => state.ws);

  // the vocabulary of this workspace
  useEffect(() => {
    if (on && ws && vocabularyWs !== ws) void useVocabulary.getState().load(ws);
  }, [on, ws, vocabularyWs]);

  const lexicon = useMemo<Lexicon | undefined>(
    () =>
      on && vocabularyWs === ws
        ? lexiconOf(
            entries.map((e) => ({
              id: e.id,
              word: e.word,
              gloss: glossOf(e, lang),
            })),
          )
        : undefined,
    [on, ws, vocabularyWs, entries, lang],
  );

  useEffect(() => {
    if (!view || view.isFixedLayout || !lexicon) return;
    const docs = () => view.renderer.getContents().map((c) => c.doc);
    const byId = new Map(entries.map((e) => [e.id, e]));

    // the words met, not translated yet: translated, a few at a time
    const queue: VocabularyEntry[] = [];
    let active = 0;
    let cancelled = false;
    const translator = translatorOf(translatorName);
    const drain = () => {
      while (!cancelled && lang && ws && active < CONCURRENT && queue.length) {
        const entry = queue.shift()!;
        active++;
        translator
          .translate(entry.word, lang)
          .then((res) =>
            useVocabulary
              .getState()
              .setTranslation(ws, entry.id, lang, res.text),
          )
          .catch((e: unknown) => console.warn("Failed to translate", e))
          .finally(() => {
            active--;
            drain();
          });
      }
    };
    const translateMet = (doc: Document) => {
      if (!lang) return;
      for (const el of doc.querySelectorAll<HTMLElement>(`.${LENS_CLASS}`)) {
        const entry = byId.get(el.dataset.lens ?? "");
        const key = `${lang}\n${entry?.id}`;
        if (
          !entry ||
          entry.gloss ||
          entry.translations?.[lang] ||
          asked.has(key)
        )
          continue;
        asked.add(key);
        queue.push(entry);
      }
      drain();
    };

    // a gloss clicked: its word in the dictionaries, not a page turned
    const onClick = (e: MouseEvent) => {
      const marker = (e.target as Element | null)?.closest?.(`.${LENS_CLASS}`);
      if (!marker) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const range = rangeOfMarker(marker);
      const entry = byId.get((marker as HTMLElement).dataset.lens ?? "");
      const index = view.renderer
        .getContents()
        .find((c) => c.doc === marker.ownerDocument)?.index;
      if (!range || !entry || index === undefined) return;
      setActivePane(pane);
      usePopups.getState().setLookup({
        kind: "dictionary",
        selection: {
          text: entry.word,
          index,
          cfi: view.getCFI(index, range),
          box: boxOfRange(
            range,
            readingArea(view, bookStore.getState().vertical),
          ),
          range,
        },
      });
    };

    const lens = (doc: Document) => {
      applyLens(doc, lexicon);
      translateMet(doc);
      // first: before foliate-js and the reader turn a page by it
      doc.addEventListener("click", onClick, true);
    };
    const onLoad = (e: Event) => {
      const { doc } = (e as CustomEvent).detail as { doc: Document };
      lens(doc);
    };
    docs().forEach(lens);
    view.addEventListener("load", onLoad);
    return () => {
      cancelled = true;
      view.removeEventListener("load", onLoad);
      for (const doc of docs()) {
        doc.removeEventListener("click", onClick, true);
        removeLens(doc);
      }
    };
  }, [view, pane, bookStore, lexicon, entries, lang, ws, translatorName]);
}

/** Forget the words asked to be translated; for tests. */
export const resetWordLens = () => asked.clear();
