import { MouseEvent, useRef, useState } from 'react';
import MsEditor, { embeds } from 'mdsmirror';
import { useStore } from 'lib/store';
import useLinkHandlers from 'editor/hooks/useLinkHandlers';

type Props = {
  /** initial markdown; remount (change `key`) to reset */
  defaultValue: string;
  onChange?: (text: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

/**
 * MsEditor for issue bodies and comments. Shares the link handling of
 * notes: [[Note]] links open notes, `issue:N` links open issues.
 *
 * The editor itself only opens links from its link toolbar, which read-only
 * editors do not have. So a click on a link opens it when the editor is
 * read-only or was not focused, or with Ctrl/Cmd; a click in a focused
 * editor still places the cursor for editing.
 */
export default function IssueEditor(props: Props) {
  const { defaultValue, onChange, readOnly = false, placeholder, autoFocus, className = '' } = props;
  // the editor resets its doc whenever `value` changes, so keep the first value
  const [initial] = useState(defaultValue);
  const darkMode = useStore((state) => state.darkMode);
  const initDir = useStore((state) => state.initDir);
  const { onSearchLink, onOpenLink } = useLinkHandlers();
  const ref = useRef<HTMLDivElement>(null);
  const wasFocused = useRef(false);

  const onMouseDown = () => {
    const active = document.activeElement;
    wasFocused.current = !!active && active !== document.body && !!ref.current?.contains(active);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest?.('a');
    if (!link || !ref.current?.contains(link)) return;
    if (link.closest('.component-attachment') || link.classList.contains('ProseMirror-widget')) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    if (readOnly || !wasFocused.current || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      void onOpenLink(href);
    }
  };

  return (
    <div
      ref={ref}
      className={`issue-editor ${className}`}
      onMouseDownCapture={onMouseDown}
      onClickCapture={onClick}
    >
      <MsEditor
        value={initial}
        dark={darkMode}
        readOnly={readOnly}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(text: string) => onChange?.(text)}
        onSearchLink={onSearchLink}
        onOpenLink={onOpenLink}
        embeds={embeds}
        disables={['sub']}
        rootPath={initDir}
      />
    </div>
  );
}
