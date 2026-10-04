import { useState } from 'react';
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
 */
export default function IssueEditor(props: Props) {
  const { defaultValue, onChange, readOnly = false, placeholder, autoFocus, className = '' } = props;
  // the editor resets its doc whenever `value` changes, so keep the first value
  const [initial] = useState(defaultValue);
  const darkMode = useStore((state) => state.darkMode);
  const initDir = useStore((state) => state.initDir);
  const { onSearchLink, onOpenLink } = useLinkHandlers();

  return (
    <div className={`issue-editor ${className}`}>
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
