import { useStore } from 'lib/store';

const FONTS = [
  { name: 'Default', font: '' },
  { name: 'Sniglet', font: 'Sniglet' },
  { name: 'RobotoMono', font: 'RobotoMono' },
  { name: 'Serif', font: 'IBMPlexSerif' },
  { name: 'SansSerif', font: 'KaTeX_SansSerif' },
];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between">
      <span>{label}</span>
      <input type="checkbox" className="toggle toggle-xs" checked={checked} aria-label={label}
        onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function NumberInput(
  { label, value, step, digits, unit, onChange }:
  { label: string; value: number; step: number; digits: number; unit?: string; onChange: (v: number) => void }
) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number" className="input input-xs w-20" step={step} aria-label={label}
          value={value.toFixed(digits)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="w-5 text-xs text-base-content/70">{unit}</span>
      </span>
    </label>
  );
}

/** How notes are written and shown: font, spacing, direction, assets, spelling. */
export default function EditorSettings() {
  const font = useStore((state) => state.font);
  const setFont = useStore((state) => state.setFont);
  const fontSize = useStore((state) => state.fontSize);
  const setFontSize = useStore((state) => state.setFontSize);
  const lineHeight = useStore((state) => state.lineHeight);
  const setLineHeight = useStore((state) => state.setLineHeight);
  const fontWt = useStore((state) => state.fontWt);
  const setFontWt = useStore((state) => state.setFontWt);
  const isRTL = useStore((state) => state.isRTL);
  const setIsRTL = useStore((state) => state.setIsRTL);
  const useAsset = useStore((state) => state.useAsset);
  const setUseAsset = useStore((state) => state.setUseAsset);
  const isCheckSpellOn = useStore((state) => state.isCheckSpellOn);
  const setIsCheckSpellOn = useStore((state) => state.setIsCheckSpellOn);

  return (
    <div className="flex flex-col gap-3 p-3 text-sm w-72" data-testid="editor-settings">
      <label className="flex items-center justify-between gap-2">
        <span>Font</span>
        <select
          className="select select-xs w-36"
          aria-label="Editor Font Family"
          value={font}
          onChange={(e) => setFont(e.target.value)}
        >
          {FONTS.map((f) => <option key={f.name} value={f.font}>{f.name}</option>)}
        </select>
      </label>
      <NumberInput label="Font Size" value={fontSize} step={0.1} digits={1} unit="em"
        onChange={(v) => setFontSize(v || 1.1)} />
      <NumberInput label="Line Height" value={lineHeight} step={0.1} digits={1} unit="em"
        onChange={(v) => setLineHeight(v || 1.6)} />
      <NumberInput label="Font Weight" value={fontWt} step={100} digits={0}
        onChange={(v) => setFontWt(v || 400)} />
      <Toggle label="Right to Left" checked={isRTL} onChange={setIsRTL} />
      <Toggle label="Spell Check" checked={isCheckSpellOn} onChange={setIsCheckSpellOn} />
      <div className="flex flex-col gap-1">
        <Toggle label="Use Assets Folder" checked={useAsset} onChange={setUseAsset} />
        <p className="text-xs text-base-content/70">To store images, files and support relative path</p>
      </div>
    </div>
  );
}
