import { useEffect, useState } from 'react';
import { store, useStore } from '@/lib/store';
import { DARK_QUERY, isSystemDark, resolveTheme } from '@/lib/themes';

/**
 * Apply the theme setting on <html>: daisyUI `data-theme` and the `dark`
 * class (for the `dark:` variants, editors and graph), so dialogs portaled out
 * of the app are themed too. Follows the system mode for the `system` theme.
 */
export default function useTheme() {
  const theme = useStore((state) => state.theme);
  const [systemDark, setSystemDark] = useState(isSystemDark);

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const { name, dark } = resolveTheme(theme, systemDark);
    const root = document.documentElement;
    root.dataset.theme = name;
    root.classList.toggle('dark', dark);
    if (store.getState().darkMode !== dark) store.getState().setDarkMode(dark);
  }, [theme, systemDark]);
}
