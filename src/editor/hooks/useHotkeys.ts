import { useEffect } from 'react';
import isHotkey from 'is-hotkey';

/**
 Alt+N, alt+n: new note
 Alt+P, alt+p: new page(item)  // reserve
 Ctrl+S, mod+s: save note  // reserve
 Esc, esc  quite
 ...
**/
export default function useHotkeys(
  hotkeys: { hotkey: string; callback: () => void }[]
) {
  useEffect(() => {
    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      for (const { hotkey, callback } of hotkeys) {
        if (isHotkey(hotkey, event)) {
          event.preventDefault();
          callback();
        }
      }
    };
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () =>
      document.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [hotkeys]);
}
