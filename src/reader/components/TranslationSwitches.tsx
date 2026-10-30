import { store, useStore } from '@/state/store';
import { Toggle } from '@/ui/ui';
import { useReaderChrome } from '../chrome';
import { activeStore, useActiveStore } from '../readerStore';
import { withDefaults } from '../settings';

/**
 * The book translated as it is read, or not; the translation alone or under
 * the text; the translated book made of it (an EPUB). Of the book last used,
 * of the two read side by side.
 */
export default function TranslationSwitches({ className = '' }: { className?: string }) {
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const on = useActiveStore((state) => Boolean(state.entry?.translate));
  const hasEntry = useActiveStore((state) => Boolean(state.entry));
  const fixed = useActiveStore((state) => state.book?.rendition?.layout === 'pre-paginated');
  if (!hasEntry || fixed) return null;
  return (
    <div className={`flex flex-col gap-2 ${className}`} data-testid="translation-switches">
      <Toggle label="Translate the book" checked={on} onChange={(v) => activeStore().getState().setTranslating(v)} />
      {on ? (
        <Toggle label="Translation only" checked={settings.translationOnly}
          onChange={(translationOnly) => store.getState().setReaderSettings({ ...settings, translationOnly })} />
      ) : null}
      {on ? (
        <button className="self-start btn btn-ghost btn-xs" onClick={() => useReaderChrome.getState().setTranslatedBook(true)}>
          Make the translated book…
        </button>
      ) : null}
    </div>
  );
}
