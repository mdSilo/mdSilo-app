import { useEffect, useState } from 'react';
import { BaseModal } from '@/ui/BaseModal';

type ConfirmProps = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  isOpen: boolean;
  onConfirm: () => void;
  handleClose: () => void;
};

/** In-app stand-in for `window.confirm`. */
export function ConfirmModal(props: ConfirmProps) {
  const { title, message, confirmLabel = 'Confirm', danger = false, isOpen, onConfirm, handleClose } = props;
  return (
    <BaseModal title={title} isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        {message ? <p className="text-sm text-center text-base-content/70">{message}</p> : null}
        <button
          type="button"
          className={`mt-4 font-bold pop-btn ${danger ? 'text-error' : ''}`}
          onClick={() => { onConfirm(); handleClose(); }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="mt-2 font-bold pop-btn" onClick={handleClose}>
          Cancel
        </button>
      </div>
    </BaseModal>
  );
}

type PromptProps = {
  title: string;
  label: string;
  initial?: string;
  submitLabel?: string;
  isOpen: boolean;
  /** called with the trimmed, non-empty value */
  onSubmit: (value: string) => void;
  handleClose: () => void;
};

/** In-app stand-in for `window.prompt`. */
export function PromptModal(props: PromptProps) {
  const { title, label, initial = '', submitLabel = 'Save', isOpen, onSubmit, handleClose } = props;
  const [value, setValue] = useState(initial);
  useEffect(() => { if (isOpen) setValue(initial); }, [isOpen, initial]);

  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    handleClose();
  };

  return (
    <BaseModal title={title} isOpen={isOpen} handleClose={handleClose}>
      <form
        className="flex flex-col justify-center px-6"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <input
          aria-label={label}
          className="w-full px-2 py-1 mt-2 bg-base-100 border border-base-300 rounded-sm"
          value={value}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="mt-4 font-bold pop-btn" disabled={!value.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="mt-2 font-bold pop-btn" onClick={handleClose}>
          Cancel
        </button>
      </form>
    </BaseModal>
  );
}
