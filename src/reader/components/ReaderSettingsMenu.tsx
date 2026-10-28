import { memo } from 'react';
import { useStore } from '@/lib/store';
import { Range, Segmented, Select, Toggle } from '@/components/misc/ui';
import {
  DEFAULT_READER_SETTINGS, KEPT_ON_RESET, withDefaults, type PageTheme, type ReaderSettings,
} from '../settings';
import { themeColors } from '../styles';
import { CODE_LANGUAGES, type CodeLanguage } from '../highlight';

const PAGE_THEMES: [PageTheme, string][] = [
  ['auto', 'As the app'], ['light', 'White'], ['sepia', 'Sepia'], ['gray', 'Gray'], ['dark', 'Dark'],
];

const LANGUAGES = [
  ['en', 'English'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ja', '日本語'], ['ko', '한국어'],
  ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['it', 'Italiano'],
  ['ru', 'Русский'], ['ar', 'العربية'],
];

/** How the books show: font, spacing, layout; and the language to translate to. */
function ReaderSettingsMenu({ fixedLayout }: { fixedLayout: boolean }) {
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const darkMode = useStore((state) => state.darkMode);
  const setReaderSettings = useStore((state) => state.setReaderSettings);
  const update = (patch: Partial<ReaderSettings>) => setReaderSettings({ ...settings, ...patch });

  return (
    <div className="flex flex-col gap-3 p-3 text-sm w-72" data-testid="reader-settings">
      <div className="flex items-center justify-between gap-2">
        <span>Page</span>
        <div className="flex gap-1.5">
          {PAGE_THEMES.map(([theme, name]) => {
            const colors = themeColors(darkMode, theme);
            return (
              <button
                key={theme}
                className={`w-7 h-7 text-xs font-semibold rounded-full border ${settings.pageTheme === theme ? 'ring-2 ring-primary' : 'border-base-300'}`}
                style={{ background: colors.bg, color: colors.fg }}
                title={name}
                aria-label={`Page ${name}`}
                aria-pressed={settings.pageTheme === theme}
                onClick={() => update({ pageTheme: theme })}
              >
                {theme === 'auto' ? 'A' : 'T'}
              </button>
            );
          })}
        </div>
      </div>
      <Segmented
        label="Layout"
        value={settings.flow}
        options={[['paginated', 'Pages'], ['scrolled', 'Scroll']] as const}
        onChange={(flow) => update({ flow })}
      />
      {fixedLayout ? null : (
        <>
          <Range label="Font size" min={12} max={32} value={settings.fontSize} format={String}
            onChange={(fontSize) => update({ fontSize })} />
          <Range label="Line height" min={1} max={2.4} step={0.1} value={settings.lineHeight}
            format={(v) => v.toFixed(1)} onChange={(lineHeight) => update({ lineHeight })} />
          <Select label="Font" value={settings.font}
            onChange={(font) => update({ font: font as ReaderSettings['font'] })}>
            <option value="book">Of the book</option>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans serif</option>
          </Select>
          <Segmented label="Columns" value={settings.maxColumns} options={[[1, '1'], [2, '2']]}
            onChange={(maxColumns) => update({ maxColumns })} />
          <Range label="Width" ariaLabel="Column width" min={400} max={1200} step={20} value={settings.maxInlineSize}
            onChange={(maxInlineSize) => update({ maxInlineSize })} />
          <Range label="Margins" min={16} max={96} step={4} value={settings.margin}
            onChange={(margin) => update({ margin })} />
          <Toggle label="Justify" checked={settings.justify} onChange={(justify) => update({ justify })} />
          <Toggle label="Hyphenate" checked={settings.hyphenate} onChange={(hyphenate) => update({ hyphenate })} />
          <Toggle label="Chapter above" checked={settings.showHeader} onChange={(showHeader) => update({ showHeader })} />
          <Toggle label="Progress below" checked={settings.showFooter} onChange={(showFooter) => update({ showFooter })} />
          <Toggle label="Image descriptions below images" checked={settings.imageCaptions} onChange={(imageCaptions) => update({ imageCaptions })} />
          <Toggle label="Highlight code" checked={settings.codeHighlight} onChange={(codeHighlight) => update({ codeHighlight })} />
          {settings.codeHighlight ? (
            <Select label="Code language" value={settings.codeLanguage}
              onChange={(lang) => update({ codeLanguage: lang as CodeLanguage })}>
              {CODE_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang === 'auto' ? 'Detect' : lang}</option>)}
            </Select>
          ) : null}
        </>
      )}
      <Toggle label="Invert image colors" checked={settings.invertImages} onChange={(invertImages) => update({ invertImages })} />
      <div className="divider my-0" />
      <Toggle label="Page turn animation" checked={settings.animated} onChange={(animated) => update({ animated })} />
      <Toggle label="Click the sides to turn pages" checked={settings.clickToTurn} onChange={(clickToTurn) => update({ clickToTurn })} />
      {settings.clickToTurn ? (
        <Toggle label="Click left to go forward" checked={settings.swapClickArea} onChange={(swapClickArea) => update({ swapClickArea })} />
      ) : null}
      <Select label="Translate to" value={settings.translateTo}
        onChange={(translateTo) => update({ translateTo })}>
        <option value="">App language</option>
        {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </Select>
      <button
        className="self-end btn btn-ghost btn-xs"
        onClick={() => setReaderSettings({
          ...DEFAULT_READER_SETTINGS,
          // not about the look
          ...Object.fromEntries(KEPT_ON_RESET.map((key) => [key, settings[key]])),
        })}
      >
        Reset
      </button>
    </div>
  );
}

export default memo(ReaderSettingsMenu);
