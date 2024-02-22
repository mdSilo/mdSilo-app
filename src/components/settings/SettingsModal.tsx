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
  
  const fontSize = useStore((state) => state.fontSize);
  const setSize = useStore((state) => state.setFontSize);
  const fontWt = useStore((state) => state.fontWt);
  const setWt = useStore((state) => state.setFontWt);
  const lineHeight = useStore((state) => state.lineHeight);
  const setHeight = useStore((state) => state.setLineHeight);

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
      <div className="flex-1 p-2 bg-gray-100">
        <SettingsToggle
          name="Theme" 
          check={darkMode}
          handleCheck={setDarkMode}
          optionLeft="Light Mode" 
          optionRight="Dark Mode"
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
        <SettingsToggle
          name="Text Direction" 
          check={isRTL}
          handleCheck={setIsRTL}
          optionLeft="Left To Right" 
          optionRight="Right To Left"
        />
        <div className="flex flex-col items-center mb-2">
          <div className="mb-2">
            <h1 className="text-base font-semibold">Editor Font Family</h1>
          </div>
          <div className="flex flex-row items-center">
            <select 
              name="select-font" 
              className="w-full p-1 rounded text-primary-500 border-none"
              style={{width: '8em'}}
              value={font || 'Default'}
              onChange={(ev) => {
                const ft = ev.target.value;
                setFont(ft);
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
        <div className="flex flex-col items-center">
          <div className="flex flex-row items-center justify-center m-1">
            <span className="text-sm text-gray-600 mr-2">Font Size: </span>
            <input type="number" className="p-1 border-none outline-none" style={{width: '5em'}} value={fontSize.toFixed(1)} step="0.1" onChange={e => setSize(Number(e.target.value) || 1.1)} />
            <span className="text-sm text-gray-600">em</span>
          </div>
          <div className="flex flex-row items-center justify-center m-1">
            <span className="text-sm text-gray-600 mr-2">Line Height: </span>
            <input type="number" className="p-1 border-none outline-none" style={{width: '5em'}} value={lineHeight.toFixed(1)} step="0.1" onChange={e => setHeight(Number(e.target.value) || 1.6)} />
            <span className="text-sm text-gray-600">em</span>
          </div>
          <div className="flex flex-row items-center justify-center m-1">
            <span className="text-sm text-gray-600 mr-2">Font Weight: </span>
            <input type="number" className="p-1 border-none outline-none" style={{width: '5em'}} value={fontWt.toFixed()} step="100" onChange={e => setWt(Number(e.target.value) || 400)} />
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
