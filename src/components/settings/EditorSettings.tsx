import { useStore } from 'lib/store';
import Toggle from 'components/misc/Toggle';

export default function EditorSettings() {
  const isPageStackingOn = useStore((state) => state.isPageStackingOn);
  const setIsPageStackingOn = useStore((state) => state.setIsPageStackingOn);
  const isCheckSpellOn = useStore((state) => state.isCheckSpellOn);
  const setIsCheckSpellOn = useStore((state) => state.setIsCheckSpellOn);

  return (
    <div className="flex-1 w-full h-full p-6 overflow-y-auto dark:bg-gray-800 dark:text-gray-100">
      <div className="mb-4">
        <h1 className="text-lg font-medium">Page Stacking</h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          To stack the minds
        </p>
      </div>
      <div className="flex items-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">Off</span>
        <Toggle
          id="page-stack"
          className="mx-2"
          isChecked={isPageStackingOn}
          setIsChecked={setIsPageStackingOn}
        />
        <span className="text-sm text-gray-600 dark:text-gray-300">On</span>
      </div>
      <div className="py-2"></div>
      <div className="mb-4 border-t dark:border-gray-700">
        <h1 className="text-lg font-medium">Spell Check</h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          Spell checker works for English 
        </p>
      </div>
      <div className="flex items-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">Off</span>
        <Toggle
          id="spell-checker"
          className="mx-2"
          isChecked={isCheckSpellOn}
          setIsChecked={setIsCheckSpellOn}
        />
        <span className="text-sm text-gray-600 dark:text-gray-300">On</span>
      </div>
    </div>
  );
}
