import { useStore } from 'lib/store';
import { BaseModal } from './BaseModal';
import { SettingsToggle } from './SettingsToggle';

type Props = {
  isOpen: boolean;
  handleClose: () => void;
}

export default function SettingsModal({ isOpen, handleClose }: Props) {

  const darkMode = useStore((state) => state.darkMode);
  const setDarkMode = useStore((state) => state.setDarkMode);
  const isPageStackingOn = useStore((state) => state.isPageStackingOn);
  const setIsPageStackingOn = useStore((state) => state.setIsPageStackingOn);
  const isCheckSpellOn = useStore((state) => state.isCheckSpellOn);
  const setIsCheckSpellOn = useStore((state) => state.setIsCheckSpellOn);

  return (
    <BaseModal title="Settings" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-800 dark:text-gray-100">
        <SettingsToggle
          name="Theme" 
          descript="Dark Mode or Light Mode"
          check={darkMode}
          handleCheck={setDarkMode}
          optionLeft="Light" 
          optionRight="Dark"
        />
        <SettingsToggle
          name="Page Stacking" 
          descript="To stack the minds"
          check={isPageStackingOn}
          handleCheck={setIsPageStackingOn}
        />
        <SettingsToggle
          name="Spell Check" 
          descript="Spell checker works for English"
          check={isCheckSpellOn}
          handleCheck={setIsCheckSpellOn}
        />
      </div>
    </BaseModal>
  );
}
