import { memo, useEffect, useState, type RefObject } from "react";
import { TbExternalLink, TbNote } from "react-icons/tb";
import { openUrl } from "@/workspace/open";
import { store, useStore } from "@/state/store";
import { Spinner } from "@/ui/ui";
import { HUMAN_LANGUAGES } from "@/lib/constants";
import { withDefaults, type ReaderSettings } from "../settings";
import { usePopups } from "../popups";
import { annotateSelection } from "../actions";
import { activeStore, useActiveStore } from "../readerStore";
import { getView } from "../view";
import { Popup } from "../components/BookPopups";
import TranslationSwitches from "../translation/TranslationSwitches";
import DictionaryLookup from "../dictionary/DictionaryLookup";
import {
  openLinkOutside,
  targetLanguage,
  translatorOf,
  TRANSLATORS,
  type TranslationResult,
} from "./lookup";

/** The text selected, looked up in the dictionaries (Wikipedia one of them), or translated. */
function LookupPopup({
  rootRef,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const lookup = usePopups((state) => state.lookup);
  const translateTo = targetLanguage(
    useStore((state) => state.readerSettings?.translateTo),
  );
  const translator = translatorOf(
    useStore((state) => state.readerSettings?.translator),
  );
  const [result, setResult] = useState<TranslationResult | undefined>();
  const [error, setError] = useState("");
  const ws = useActiveStore((state) => state.ws);

  useEffect(() => {
    // the dictionaries look up in DictionaryLookup
    if (!lookup || lookup.kind === "dictionary") return;
    let cancelled = false;
    setResult(undefined);
    setError("");
    translator
      .translate(lookup.selection.text, translateTo)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [lookup, translateTo, translator]);

  if (!lookup) return null;
  const { kind, selection } = lookup;
  const lang = getView()?.language?.canonical;

  /** Keep what was found as the note of a highlight of the text. */
  const keep = (note: string) => {
    const created = annotateSelection(selection);
    activeStore().getState().updateNote(created.id, { note });
    usePopups.getState().clear();
  };

  if (kind === "dictionary") {
    return (
      <Popup
        box={selection.box}
        rootRef={rootRef}
        testId="lookup-popup"
        height={280}
        width={380}
      >
        <DictionaryLookup
          selection={selection}
          lang={lang}
          ws={ws}
          onKeep={keep}
          placeOf={placeOfBook}
        />
      </Popup>
    );
  }

  const webUrl = translator.url(selection.text, translateTo);

  return (
    <Popup
      box={selection.box}
      rootRef={rootRef}
      testId="lookup-popup"
      height={260}
      width={360}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase text-base-content/60">
          Translation
        </span>
        <TranslateOptions translator={translator.name} to={translateTo} />
        <button
          className="btn btn-ghost btn-xs"
          title="Open on the web"
          onClick={() => void openUrl(webUrl)}
        >
          <TbExternalLink />
        </button>
      </div>
      <div
        className="overflow-y-auto text-sm max-h-60"
        onClick={openLinkOutside}
      >
        {error ? (
          <p className="text-error">Could not look it up: {error}</p>
        ) : !result ? (
          <Spinner size="sm" className="mx-auto my-4" />
        ) : (
          <p className="whitespace-pre-wrap" lang={result.to}>
            {result.text}
          </p>
        )}
      </div>
      <TranslationSwitches className="pt-2 mt-2 border-t border-base-300" />
      {result && !error ? (
        <div className="flex justify-end gap-1 mt-1">
          <button
            className="btn btn-ghost btn-xs"
            title="Highlight the text, with this as its note"
            onClick={() => keep(result.text)}
          >
            <TbNote /> Keep as note
          </button>
        </div>
      ) : null}
    </Popup>
  );
}

/** The book read, for a word added to the vocabulary. */
function placeOfBook() {
  const { hash, entry } = activeStore().getState();
  return hash ? { book: hash, title: entry?.title } : {};
}

/** The service and the language to translate to: chosen here, used from then on. */
function TranslateOptions({
  translator,
  to,
}: {
  translator: string;
  to: string;
}) {
  const update = (patch: Partial<ReaderSettings>) => {
    const { readerSettings, setReaderSettings } = store.getState();
    setReaderSettings({ ...withDefaults(readerSettings), ...patch });
  };
  const select = "select select-ghost select-xs min-h-0 h-6 font-normal";
  return (
    <div className="flex items-center gap-1 ml-auto">
      {TRANSLATORS.length > 1 ? (
        <select
          className={select}
          aria-label="Translate by"
          value={translator}
          onChange={(e) => update({ translator: e.target.value })}
        >
          {TRANSLATORS.map((t) => (
            <option key={t.name} value={t.name}>
              {t.label}
            </option>
          ))}
        </select>
      ) : null}
      <select
        className={select}
        aria-label="Translate to"
        value={to}
        onChange={(e) => update({ translateTo: e.target.value })}
      >
        {/* the language of the app, if not one offered */}
        {HUMAN_LANGUAGES.some(([code]) => code === to) ? null : (
          <option value={to}>{to}</option>
        )}
        {HUMAN_LANGUAGES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default memo(LookupPopup);
