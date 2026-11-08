import { useEffect, useMemo, useState } from "react";
import { Popup } from "@/reader/components/BookPopups";
import DictionaryLookup from "@/reader/dictionary/DictionaryLookup";
import { useDictionaryWorkspace } from "@/reader/dictionary/dictionary";
import { useEditorLookup } from "./editorLookup";

const TEST_ID = "editor-lookup-popup";

const inPopup = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(`[data-testid="${TEST_ID}"]`));

/** The popup of a lookup in a note (see editorLookup), at the text. */
export default function EditorLookupPopup() {
  const lookup = useEditorLookup((state) => state.lookup);
  const ws = useDictionaryWorkspace();
  // the window, as the root the popup is put in
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const rootRef = useMemo(() => ({ current: root }), [root]);

  useEffect(() => {
    if (!lookup) return;
    const { clear } = useEditorLookup.getState();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    const onOutside = (e: Event) => {
      if (!inPopup(e.target)) clear();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    // the text scrolled away: not where the popup points
    document.addEventListener("scroll", onOutside, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("scroll", onOutside, true);
    };
  }, [lookup]);

  if (!lookup) return null;
  return (
    <div ref={setRoot} className="fixed inset-0 z-40 pointer-events-none">
      <Popup
        box={lookup.box}
        rootRef={rootRef}
        testId={TEST_ID}
        height={280}
        width={380}
        className="pointer-events-auto"
      >
        <DictionaryLookup selection={lookup} ws={ws} />
      </Popup>
    </div>
  );
}
