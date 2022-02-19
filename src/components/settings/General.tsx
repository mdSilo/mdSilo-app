import { useStore } from 'lib/store';
import Toggle from 'components/misc/Toggle';

export default function General() {
  const darkMode = useStore((state) => state.darkMode);
  const setDarkMode = useStore((state) => state.setDarkMode);

  return (
    <div className="flex-1 w-full h-full p-6 overflow-y-auto dark:bg-gray-800 dark:text-gray-100">
      <h1 className="mb-4 text-lg font-medium">Theme</h1>
      <div className="flex items-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">Light</span>
        <Toggle
          id="theme-mode"
          className="mx-2"
          isChecked={darkMode}
          setIsChecked={setDarkMode}
        />
        <span className="text-sm text-gray-600 dark:text-gray-300">Dark</span>
      </div>
    </div>
  );
}
