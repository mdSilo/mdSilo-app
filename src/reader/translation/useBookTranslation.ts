import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { baseLanguage, targetLanguage, translatorOf } from '../lookup/lookup';
import { storeOf } from '../readerStore';
import { withDefaults } from '../settings';
import type { FoliateView, Pane } from '../view';
import {
  blocksAround, blocksOf, removeTranslations, scopeOf, showTranslation, 
  sourceTextOf, translationsOf, TRANSLATION_CLASS,
} from './translation';

/** translations asked at once, at most: not to be blocked by the service */
const CONCURRENT = 3;

/**
 * The book translated as it is read: the paragraphs of the page, and a few
 * after it, with their translation; kept, to show them again at once. A
 * fixed layout (PDF, comics) is not.
 */
export function useBookTranslation(view: FoliateView | null, pane: Pane) {
  const bookStore = storeOf(pane);
  const on = bookStore((state) => Boolean(state.entry?.translate));
  const ws = bookStore((state) => state.ws);
  const hash = bookStore((state) => state.hash);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const translator = translatorOf(settings.translator);
  const lang = targetLanguage(settings.translateTo);
  const only = settings.translationOnly;

  useEffect(() => {
    if (!on || !view || !ws || !hash || view.isFixedLayout) return;
    // in that language already, as the book says: nothing to ask
    const written = view.language?.canonical;
    if (written && baseLanguage(written) === baseLanguage(lang)) return;
    let cancelled = false;
    const kept = translationsOf(ws, hash);
    const scope = scopeOf(translator.name, lang);
    const queue: Element[] = [];
    const pending = new Set<Element>();
    let active = 0;

    // the same as the text: nothing to add
    const show = (block: Element, key: string, text: string) => {
      if (text && text !== key) showTranslation(block, text, lang, only);
    };
    const drain = () => {
      while (!cancelled && active < CONCURRENT && queue.length) {
        const block = queue.shift()!;
        const key = sourceTextOf(block);
        active++;
        translator.translate(key, lang)
          .then((result) => {
            kept.set(scope, key, result.text);
            if (!cancelled && block.isConnected) show(block, key, result.text);
          })
          .catch((e: unknown) => console.warn('Failed to translate', e))
          .finally(() => {
            active--;
            pending.delete(block);
            drain();
          });
      }
    };
    const translateAround = (range?: Range) => {
      const doc = range?.startContainer.ownerDocument;
      if (!doc || cancelled) return;
      for (const block of blocksAround(blocksOf(doc.body), range)) {
        if (pending.has(block) || block.querySelector(`:scope > .${TRANSLATION_CLASS}`)) continue;
        const key = sourceTextOf(block);
        if (!key) continue;
        const text = kept.get(scope, key);
        if (text !== undefined) show(block, key, text);
        else {
          pending.add(block);
          queue.push(block);
        }
      }
      drain();
    };
    const onRelocate = (e: Event) => translateAround((e as CustomEvent).detail?.range);

    view.addEventListener('relocate', onRelocate);
    void kept.load().then(() => translateAround(view.lastLocation?.range));
    return () => {
      cancelled = true;
      view.removeEventListener('relocate', onRelocate);
      for (const { doc } of view.renderer.getContents()) removeTranslations(doc);
      void kept.flush();
    };
  }, [on, view, ws, hash, translator, lang, only]);
}
