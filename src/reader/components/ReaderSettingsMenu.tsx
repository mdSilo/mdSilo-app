import { memo } from 'react';
import { useStore } from 'lib/store';
import { DEFAULT_READER_SETTINGS, withDefaults, type ReaderSettings } from '../settings';

const LANGUAGES = [
  ['en', 'English'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ja', '日本語'], ['ko', '한국어'],
  ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['it', 'Italiano'],
  ['ru', 'Русский'], ['ar', 'العربية'],
];

/** How the books show: font, spacing, layout; and the language to translate to. */
function ReaderSettingsMenu({ fixedLayout }: { fixedLayout: boolean }) {
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const setReaderSettings = useStore((state) => state.setReaderSettings);
  const update = (patch: Partial<ReaderSettings>) => setReaderSettings({ ...settings, ...patch });

  return (
    <div className="flex flex-col gap-3 p-3 text-sm w-72" data-testid="reader-settings">
      <label className="flex items-center justify-between gap-2">
        <span>Layout</span>
        <div className="join">
          {(['paginated', 'scrolled'] as const).map((flow) => (
            <button
              key={flow}
              className={`join-item btn btn-xs ${settings.flow === flow ? 'btn-active' : ''}`}
              onClick={() => update({ flow })}
            >
              {flow === 'paginated' ? 'Pages' : 'Scroll'}
            </button>
          ))}
        </div>
      </label>
      {fixedLayout ? null : (
        <>
          <label className="flex items-center justify-between gap-2">
            <span>Font size</span>
            <input
              type="range" min={12} max={32} step={1} className="range range-xs w-36"
              value={settings.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              aria-label="Font size"
            />
            <span className="w-8 text-right">{settings.fontSize}</span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Line height</span>
            <input
              type="range" min={1} max={2.4} step={0.1} className="range range-xs w-36"
              value={settings.lineHeight}
              onChange={(e) => update({ lineHeight: Number(e.target.value) })}
              aria-label="Line height"
            />
            <span className="w-8 text-right">{settings.lineHeight.toFixed(1)}</span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Font</span>
            <select
              className="select select-xs w-36"
              value={settings.font}
              onChange={(e) => update({ font: e.target.value as ReaderSettings['font'] })}
            >
              <option value="book">Of the book</option>
              <option value="serif">Serif</option>
              <option value="sans-serif">Sans serif</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Columns</span>
            <div className="join">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  className={`join-item btn btn-xs ${settings.maxColumns === n ? 'btn-active' : ''}`}
                  onClick={() => update({ maxColumns: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Width</span>
            <input
              type="range" min={400} max={1200} step={20} className="range range-xs w-36"
              value={settings.maxInlineSize}
              onChange={(e) => update({ maxInlineSize: Number(e.target.value) })}
              aria-label="Column width"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Justify</span>
            <input type="checkbox" className="toggle toggle-xs" checked={settings.justify}
              onChange={(e) => update({ justify: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between">
            <span>Hyphenate</span>
            <input type="checkbox" className="toggle toggle-xs" checked={settings.hyphenate}
              onChange={(e) => update({ hyphenate: e.target.checked })} />
          </label>
        </>
      )}
      <label className="flex items-center justify-between gap-2">
        <span>Translate to</span>
        <select
          className="select select-xs w-36"
          value={settings.translateTo}
          onChange={(e) => update({ translateTo: e.target.value })}
        >
          <option value="">App language</option>
          {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      <button
        className="self-end btn btn-ghost btn-xs"
        onClick={() => setReaderSettings({
          ...DEFAULT_READER_SETTINGS,
          // not about the look
          ttsVoice: settings.ttsVoice, ttsRate: settings.ttsRate, translateTo: settings.translateTo,
        })}
      >
        Reset
      </button>
    </div>
  );
}

export default memo(ReaderSettingsMenu);
