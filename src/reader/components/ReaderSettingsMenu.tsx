import { memo } from 'react';
import { useStore } from '@/state/store';
import { Range, Segmented, Select, Toggle } from '@/ui/ui';
import {
  DEFAULT_READER_SETTINGS, KEPT_ON_RESET, MAX_ZOOM, MIN_ZOOM, withDefaults, zoomBy,
  type PageTheme, type ReaderSettings, type WritingMode,
} from '../settings';
import { useReaderStore } from '../readerStore';
import { bookDir, pagesDirection, rtlPagesMode, themeColors } from '../styles';
import { CODE_LANGUAGES, type CodeLanguage } from '../highlight';
import TranslationSwitches from '../translation/TranslationSwitches';
import { RULER_COLORS, RULER_SWATCHES } from '../ruler/ruler';

const PAGE_THEMES: [PageTheme, string][] = [
  ['auto', 'As the app'], ['light', 'White'], ['sepia', 'Sepia'], ['gray', 'Gray'], ['dark', 'Dark'],
];

const WRITING_MODES: [WritingMode, string][] = [
  ['auto', 'As the book'],
  ['horizontal-tb', 'Horizontal'],
  ['vertical-rl', 'Vertical, right to left'],
  ['vertical-lr', 'Vertical, left to right'],
  ['horizontal-rtl', 'Horizontal, right to left'],
];

/** How the books show: font, spacing, layout. */
function ReaderSettingsMenu({ fixedLayout }: { fixedLayout: boolean }) {
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const darkMode = useStore((state) => state.darkMode);
  const setReaderSettings = useStore((state) => state.setReaderSettings);
  const update = (patch: Partial<ReaderSettings>) => setReaderSettings({ ...settings, ...patch });
  // of the book read, not of all books
  const book = useReaderStore((state) => state.book);
  const hasBook = Boolean(book);
  const writingMode = useReaderStore((state) => state.writingMode);
  const vertical = useReaderStore((state) => state.vertical);

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
      {fixedLayout ? (
        <Segmented
          label="Layout"
          value={settings.flow === 'paginated' ? 'paginated' : settings.scrollDirection}
          options={[['paginated', 'Pages'], ['vertical', 'Vertical'], ['horizontal', 'Horizontal']] as const}
          onChange={(layout) => update(layout === 'paginated'
            ? { flow: 'paginated' }
            // a webtoon is scrolled down
            : { flow: 'scrolled', scrollDirection: layout, ...(layout === 'horizontal' ? { webtoon: false } : {}) })}
        />
      ) : (
        <Segmented
          label="Layout"
          value={settings.flow}
          options={[['paginated', 'Pages'], ['scrolled', 'Scroll']] as const}
          onChange={(flow) => update({ flow })}
        />
      )}
      {fixedLayout ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>Zoom</span>
            <div className="join" role="group" aria-label="Zoom">
              <button className="join-item btn btn-xs" aria-label="Zoom out" title="Zoom out (Ctrl -)"
                disabled={settings.zoomLevel <= MIN_ZOOM} onClick={() => update({ zoomLevel: zoomBy(settings.zoomLevel, -1) })}>
                −
              </button>
              <button className="join-item btn btn-xs w-14" aria-label="Reset zoom" title="Reset zoom (Ctrl 0)"
                onClick={() => update({ zoomLevel: DEFAULT_READER_SETTINGS.zoomLevel })}>
                {settings.zoomLevel}%
              </button>
              <button className="join-item btn btn-xs" aria-label="Zoom in" title="Zoom in (Ctrl +)"
                disabled={settings.zoomLevel >= MAX_ZOOM} onClick={() => update({ zoomLevel: zoomBy(settings.zoomLevel, 1) })}>
                +
              </button>
            </div>
          </div>
          {settings.flow === 'paginated' ? (
            <>
              {/* scrolled, the pages fit the width of the strip down, the height of the strip across */}
              <Segmented
                label="Fit"
                value={settings.zoomMode}
                options={[['fit-page', 'Page'], ['fit-width', 'Width']] as const}
                onChange={(zoomMode) => update({ zoomMode })}
              />
              <Segmented
                label="Spread"
                value={settings.spreadMode}
                options={[['none', 'One page'], ['auto', 'Two pages']] as const}
                onChange={(spreadMode) => update({ spreadMode })}
              />
              {settings.spreadMode === 'auto' ? (
                <Toggle label="Cover page alone" checked={settings.separateCover}
                  onChange={(separateCover) => update({ separateCover })} />
              ) : null}
            </>
          ) : settings.scrollDirection === 'vertical' ? (
            // a webtoon fills the width: not zoomed, no page cut off
            <Toggle label="Webtoon (no gaps)" checked={settings.webtoon}
              onChange={(webtoon) => update(webtoon ? { webtoon, zoomLevel: DEFAULT_READER_SETTINGS.zoomLevel } : { webtoon })} />
          ) : null}
          {/* scrolled across, the reading moves sideways: not locked */}
          {settings.flow === 'scrolled' && settings.scrollDirection === 'horizontal' ? null : (
            <Toggle label="Lock horizontal panning" checked={settings.lockPanX}
              onChange={(lockPanX) => update({ lockPanX })} />
          )}
          {/* of the book read, e.g. a manga in a CBZ, which does not say so */}
          {book ? (
            <Toggle
              label="Right-to-left pages"
              checked={pagesDirection(writingMode) === 'auto' ? bookDir(book) === 'rtl' : writingMode === 'horizontal-rtl'}
              onChange={(rtl) => useReaderStore.getState().setWritingMode(rtlPagesMode(book, rtl))}
            />
          ) : null}
        </>
      ) : (
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
          {hasBook ? (
            <Select label="Writing Mode" value={writingMode}
              onChange={(mode) => useReaderStore.getState().setWritingMode(mode as WritingMode)}>
              {WRITING_MODES.map(([mode, name]) => <option key={mode} value={mode}>{name}</option>)}
            </Select>
          ) : null}
          {vertical ? (
            <Toggle label="Double border" checked={settings.doubleBorder} onChange={(doubleBorder) => update({ doubleBorder })} />
          ) : null}
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
      {fixedLayout ? null : (
        <>
          <Toggle label="Reading ruler" checked={settings.readingRuler} onChange={(readingRuler) => update({ readingRuler })} />
          {settings.readingRuler ? (
            <>
              <Range label="Ruler lines" min={1} max={6} value={settings.rulerLines} format={String}
                onChange={(rulerLines) => update({ rulerLines })} />
              <div className="flex items-center justify-between gap-2">
                <span>Ruler color</span>
                <div className="flex gap-1.5">
                  {RULER_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-5 h-5 rounded-full border border-base-300 ${settings.rulerColor === color ? 'ring-2 ring-primary' : ''}`}
                      style={{ background: RULER_SWATCHES[color] }}
                      title={color === 'transparent' ? 'None' : color}
                      aria-label={`Ruler ${color === 'transparent' ? 'no color' : color}`}
                      aria-pressed={settings.rulerColor === color}
                      onClick={() => update({ rulerColor: color })}
                    />
                  ))}
                </div>
              </div>
              <Range label="Ruler opacity" min={0.1} max={0.9} step={0.1} value={settings.rulerOpacity}
                format={(v) => v.toFixed(1)} onChange={(rulerOpacity) => update({ rulerOpacity })} />
            </>
          ) : null}
        </>
      )}
      <TranslationSwitches />
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
