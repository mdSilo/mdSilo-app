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
  const useAsset = useStore((state) => state.useAsset);
  const setUseAsset = useStore((state) => state.setUseAsset);
  const isRTL = useStore((state) => state.isRTL);
  const setIsRTL = useStore((state) => state.setIsRTL);
  const isOpenPreOn = useStore((state) => state.isOpenPreOn);
  const setIsOpenPreOn = useStore((state) => state.setIsOpenPreOn);
  
  // const isCheckSpellOn = useStore((state) => state.isCheckSpellOn);
  // const setIsCheckSpellOn = useStore((state) => state.setIsCheckSpellOn);
  // const readMode = useStore((state) => state.readMode);
  // const setReadMode = useStore((state) => state.setReadMode);

  const font = useStore((state) => state.font);
  const setFont = useStore((state) => state.setFont);
  const fonts = [
    {name: 'Default', font: ''}, 
    {name: 'Sniglet', font: 'Sniglet'}, 
    {name: 'RobotoMono', font: 'RobotoMono'}, 
    {name: 'Serif', font: 'IBMPlexSerif'},
    {name: 'SansSerif', font: 'KaTeX_SansSerif'}
  ];

  return (
    <BaseModal title="Settings" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex-1 p-4 bg-gray-100">
        <SettingsToggle
          name="Theme" 
          descript="Dark Mode or Light Mode"
          check={darkMode}
          handleCheck={setDarkMode}
          optionLeft="Light" 
          optionRight="Dark"
        />
        <SettingsToggle
          name="Use Assets Folder" 
          descript="To store images, files and support relative path"
          check={useAsset}
          handleCheck={setUseAsset}
          optionLeft="No" 
          optionRight="Yes"
        />
        <SettingsToggle
          name="Open Previous Folder on Startup" 
          check={isOpenPreOn}
          handleCheck={setIsOpenPreOn}
          optionLeft="No" 
          optionRight="Yes"
        /> 
        {/* <SettingsToggle
          name="Write or Read Only" 
          check={readMode}
          handleCheck={setReadMode}
          optionLeft="Write" 
          optionRight="Read"
        /> 
        <SettingsToggle
          name="Spell Check" 
          descript="Spell checker works for English"
          check={isCheckSpellOn}
          handleCheck={setIsCheckSpellOn}
        /> */}
        <SettingsToggle
          name="Text Direction" 
          check={isRTL}
          handleCheck={setIsRTL}
          optionLeft="Left To Right" 
          optionRight="Right To Left"
        />
        <div className="flex flex-col items-center mb-4">
          <div className="mb-2">
            <h1 className="text-xl font-semibold">Set Editor Font</h1>
          </div>
          <div className="flex flex-row items-center">
            <select 
              name="select-font" 
              className="w-full p-2 rounded text-primary-500 border-none"
              value={font || 'Default'}
              onChange={(ev) => {
                const ft = ev.target.value;
                setFont(ft);
                console.log("select font: ", ft)
              }}
            >
              {fonts.map((font, index) => (
                <option key={`font-${index}`} value={font.font}>
                  {font.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
