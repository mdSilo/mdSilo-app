import { memo } from "react";
import { useStore } from "@/state/store";
import { Range, Segmented, Select, Toggle } from "@/ui/ui";
import FontSelect from "@/ui/FontSelect";
import { CODE_LANGUAGES, HUMAN_LANGUAGES } from "@/lib/constants";
import { t, tk, useT } from "@/i18n";
import {
  DEFAULT_READER_SETTINGS,
  KEPT_ON_RESET,
  MAX_ZOOM,
  MIN_ZOOM,
  withDefaults,
  zoomBy,
  type PageTheme,
  type ReaderSettings,
  type WritingMode,
} from "../settings";
import { useReaderStore } from "../readerStore";
import { bookDir, pagesDirection, rtlPagesMode, themeColors } from "../styles";
import { type CodeLanguage } from "../highlight";
import TranslationSwitches from "../translation/TranslationSwitches";
import { targetLanguage } from "../lookup/lookup";
import { LENS_COLORS, LENS_SIZE, lensColorOf } from "../lens/lensStyles";

/** The name of a language code, as the app lists it; else the code. */
const languageName = (code: string) =>
  HUMAN_LANGUAGES.find(([c]) => c === code)?.[1] ?? code;
import { RULER_COLORS, RULER_SWATCHES } from "../ruler/ruler";

const PAGE_THEMES: [PageTheme, string][] = [
  ["auto", tk("As the app")],
  ["light", tk("White")],
  ["sepia", tk("Sepia")],
  ["gray", tk("Gray")],
  ["dark", tk("Dark")],
];

const WRITING_MODES: [WritingMode, string][] = [
  ["auto", tk("As the book")],
  ["horizontal-tb", tk("Horizontal")],
  ["vertical-rl", "Vertical, right to left"],
  ["vertical-lr", "Vertical, left to right"],
  ["horizontal-rtl", "Horizontal, right to left"],
];

/** How the books show: font, spacing, layout. */
function ReaderSettingsMenu({ fixedLayout }: { fixedLayout: boolean }) {
  const t = useT();
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const darkMode = useStore((state) => state.darkMode);
  const setReaderSettings = useStore((state) => state.setReaderSettings);
  const update = (patch: Partial<ReaderSettings>) =>
    setReaderSettings({ ...settings, ...patch });
  // of the book read, not of all books
  const book = useReaderStore((state) => state.book);
  const hasBook = Boolean(book);
  const writingMode = useReaderStore((state) => state.writingMode);
  const vertical = useReaderStore((state) => state.vertical);
  // the colors of the glosses as on the pages
  const pageColors = themeColors(darkMode, settings.pageTheme);

  return (
    <div
      className="flex flex-col gap-3 p-3 text-sm w-72"
      data-testid="reader-settings"
    >
      <div className="flex items-center justify-between gap-2">
        <span>{t("Page")}</span>
        <div className="flex gap-1.5">
          {PAGE_THEMES.map(([theme, name]) => {
            const colors = themeColors(darkMode, theme);
            return (
              <button
                key={theme}
                className={`w-7 h-7 text-xs font-semibold rounded-full border ${settings.pageTheme === theme ? "ring-2 ring-primary" : "border-base-300"}`}
                style={{ background: colors.bg, color: colors.fg }}
                title={t(name)}
                aria-label={t("Page {name}", { name: t(name) })}
                aria-pressed={settings.pageTheme === theme}
                onClick={() => update({ pageTheme: theme })}
              >
                {theme === "auto" ? "A" : "T"}
              </button>
            );
          })}
        </div>
      </div>
      <Toggle
        label={t("Invert image colors")}
        checked={settings.invertImages}
        onChange={(invertImages) => update({ invertImages })}
      />
      <div className="divider my-0" />
      {fixedLayout ? (
        <Segmented
          label={t("Layout")}
          value={
            settings.flow === "paginated"
              ? "paginated"
              : settings.scrollDirection
          }
          options={
            [
              ["paginated", t("Pages")],
              ["vertical", t("Vertical")],
              ["horizontal", t("Horizontal")],
            ] as const
          }
          onChange={(layout) =>
            update(
              layout === "paginated"
                ? { flow: "paginated" }
                : // a webtoon is scrolled down
                  {
                    flow: "scrolled",
                    scrollDirection: layout,
                    ...(layout === "horizontal" ? { webtoon: false } : {}),
                  },
            )
          }
        />
      ) : (
        <Segmented
          label={t("Layout")}
          value={settings.flow}
          options={
            [
              ["paginated", t("Pages")],
              ["scrolled", t("Scroll")],
            ] as const
          }
          onChange={(flow) => update({ flow })}
        />
      )}
      {fixedLayout ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>{t("Zoom")}</span>
            <div className="join" role="group" aria-label={t("Zoom")}>
              <button
                className="join-item btn btn-xs"
                aria-label={t("Zoom out")}
                title={t("Zoom out (Ctrl -)")}
                disabled={settings.zoomLevel <= MIN_ZOOM}
                onClick={() =>
                  update({ zoomLevel: zoomBy(settings.zoomLevel, -1) })
                }
              >
                −
              </button>
              <button
                className="join-item btn btn-xs w-14"
                aria-label={t("Reset zoom")}
                title={t("Reset zoom (Ctrl 0)")}
                onClick={() =>
                  update({ zoomLevel: DEFAULT_READER_SETTINGS.zoomLevel })
                }
              >
                {settings.zoomLevel}%
              </button>
              <button
                className="join-item btn btn-xs"
                aria-label={t("Zoom in")}
                title={t("Zoom in (Ctrl +)")}
                disabled={settings.zoomLevel >= MAX_ZOOM}
                onClick={() =>
                  update({ zoomLevel: zoomBy(settings.zoomLevel, 1) })
                }
              >
                +
              </button>
            </div>
          </div>
          {settings.flow === "paginated" ? (
            <>
              {/* scrolled, the pages fit the width of the strip down, the height of the strip across */}
              <Segmented
                label={t("Fit")}
                value={settings.zoomMode}
                options={
                  [
                    ["fit-page", t("Page")],
                    ["fit-width", t("Width")],
                  ] as const
                }
                onChange={(zoomMode) => update({ zoomMode })}
              />
              <Segmented
                label={t("Spread")}
                value={settings.spreadMode}
                options={
                  [
                    ["none", t("One page")],
                    ["auto", t("Two pages")],
                  ] as const
                }
                onChange={(spreadMode) => update({ spreadMode })}
              />
              {settings.spreadMode === "auto" ? (
                <Toggle
                  label={t("Cover page alone")}
                  checked={settings.separateCover}
                  onChange={(separateCover) => update({ separateCover })}
                />
              ) : null}
            </>
          ) : settings.scrollDirection === "vertical" ? (
            // a webtoon fills the width: not zoomed, no page cut off
            <Toggle
              label={t("Webtoon (no gaps)")}
              checked={settings.webtoon}
              onChange={(webtoon) =>
                update(
                  webtoon
                    ? { webtoon, zoomLevel: DEFAULT_READER_SETTINGS.zoomLevel }
                    : { webtoon },
                )
              }
            />
          ) : null}
          {/* scrolled across, the reading moves sideways: not locked */}
          {settings.flow === "scrolled" &&
          settings.scrollDirection === "horizontal" ? null : (
            <Toggle
              label={t("Lock horizontal panning")}
              checked={settings.lockPanX}
              onChange={(lockPanX) => update({ lockPanX })}
            />
          )}
          {/* of the book read, e.g. a manga in a CBZ, which does not say so */}
          {book ? (
            <Toggle
              label={t("Right-to-left pages")}
              checked={
                pagesDirection(writingMode) === "auto"
                  ? bookDir(book) === "rtl"
                  : writingMode === "horizontal-rtl"
              }
              onChange={(rtl) =>
                useReaderStore
                  .getState()
                  .setWritingMode(rtlPagesMode(book, rtl))
              }
            />
          ) : null}
        </>
      ) : (
        <>
          <Range
            label={t("Font size")}
            min={12}
            max={32}
            value={settings.fontSize}
            format={String}
            onChange={(fontSize) => update({ fontSize })}
          />
          <Range
            label={t("Line height")}
            min={1}
            max={2.4}
            step={0.1}
            value={settings.lineHeight}
            format={(v) => v.toFixed(1)}
            onChange={(lineHeight) => update({ lineHeight })}
          />
          <FontSelect
            label={t("Font")}
            value={settings.font}
            onChange={(font) => update({ font })}
            defaultOption={["book", t("Of the book")]}
          />
          <FontSelect
            label={t("CJK font")}
            value={settings.cjkFont}
            onChange={(cjkFont) => update({ cjkFont })}
            defaultOption={["", t("None")]}
          />
          {hasBook ? (
            <Select
              label={t("Writing Mode")}
              value={writingMode}
              onChange={(mode) =>
                useReaderStore.getState().setWritingMode(mode as WritingMode)
              }
            >
              {WRITING_MODES.map(([mode, name]) => (
                <option key={mode} value={mode}>
                  {t(name)}
                </option>
              ))}
            </Select>
          ) : null}
          {vertical ? (
            <Toggle
              label={t("Double border")}
              checked={settings.doubleBorder}
              onChange={(doubleBorder) => update({ doubleBorder })}
            />
          ) : null}
          <div className="divider my-0" />
          <Segmented
            label={t("Columns")}
            value={settings.maxColumns}
            options={[
              [1, "1"],
              [2, "2"],
            ]}
            onChange={(maxColumns) => update({ maxColumns })}
          />
          <Range
            label={t("Width")}
            ariaLabel={t("Column width")}
            min={400}
            max={1200}
            step={20}
            value={settings.maxInlineSize}
            format={String}
            onChange={(maxInlineSize) => update({ maxInlineSize })}
          />
          <Range
            label={t("Margins")}
            min={16}
            max={96}
            step={4}
            value={settings.margin}
            format={String}
            onChange={(margin) => update({ margin })}
          />
          <Toggle
            label={t("Justify")}
            checked={settings.justify}
            onChange={(justify) => update({ justify })}
          />
          <Toggle
            label={t("Hyphenate")}
            checked={settings.hyphenate}
            onChange={(hyphenate) => update({ hyphenate })}
          />
          <Toggle
            label={t("Chapter above")}
            checked={settings.showHeader}
            onChange={(showHeader) => update({ showHeader })}
          />
          <Toggle
            label={t("Progress below")}
            checked={settings.showFooter}
            onChange={(showFooter) => update({ showFooter })}
          />
          <Toggle
            label={t("Image descriptions attached")}
            checked={settings.imageCaptions}
            onChange={(imageCaptions) => update({ imageCaptions })}
          />
          <Toggle
            label={t("Highlight code")}
            checked={settings.codeHighlight}
            onChange={(codeHighlight) => update({ codeHighlight })}
          />
          {settings.codeHighlight ? (
            <Select
              label={t("Code language")}
              value={settings.codeLanguage}
              onChange={(lang) =>
                update({ codeLanguage: lang as CodeLanguage })
              }
            >
              {CODE_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === "auto" ? t("Detect") : lang}
                </option>
              ))}
            </Select>
          ) : null}
          <Toggle
            label={t("Word lens")}
            checked={settings.wordLens}
            onChange={(wordLens) => update({ wordLens })}
          />
          {settings.wordLens ? (
            <p className="-mt-1 text-xs text-base-content/60">
              {t(
                "The words of your vocabulary with a short meaning under them; click one to look it up.",
              )}
            </p>
          ) : null}
          {settings.wordLens ? (
            <Select
              label={t("Gloss")}
              value={settings.lensGloss}
              onChange={(value) =>
                update({
                  lensGloss:
                    value === "translation" ? "translation" : "definition",
                })
              }
            >
              <option value="definition">{t("Definition")}</option>
              <option value="translation">
                {t("Translation ({language})", {
                  language: languageName(targetLanguage(settings.translateTo)),
                })}
              </option>
            </Select>
          ) : null}
          {settings.wordLens ? (
            <>
              <Range
                label={t("Gloss size")}
                min={LENS_SIZE.min}
                max={LENS_SIZE.max}
                step={0.05}
                value={settings.lensSize}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(lensSize) => update({ lensSize })}
              />
              <div className="flex items-center justify-between gap-2">
                <span>{t("Gloss color")}</span>
                <div className="flex gap-1.5">
                  {LENS_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-5 h-5 rounded-full border border-base-300 ${settings.lensColor === color ? "ring-2 ring-primary" : ""}`}
                      style={{ background: lensColorOf(color, pageColors) }}
                      title={
                        color === "accent" ? t("Accent of the page") : color
                      }
                      aria-label={t("Gloss {color}", { color })}
                      aria-pressed={settings.lensColor === color}
                      onClick={() => update({ lensColor: color })}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
      <div className="divider my-0" />
      <Toggle
        label={t("Page turn animation")}
        checked={settings.animated}
        onChange={(animated) => update({ animated })}
      />
      <Toggle
        label={t("Click the sides to turn pages")}
        checked={settings.clickToTurn}
        onChange={(clickToTurn) => update({ clickToTurn })}
      />
      {settings.clickToTurn ? (
        <Toggle
          label={t("Click left to go forward")}
          checked={settings.swapClickArea}
          onChange={(swapClickArea) => update({ swapClickArea })}
        />
      ) : null}
      {fixedLayout ? null : (
        <>
          <Toggle
            label={t("Reading ruler")}
            checked={settings.readingRuler}
            onChange={(readingRuler) => update({ readingRuler })}
          />
          {settings.readingRuler ? (
            <>
              <Range
                label={t("Ruler lines")}
                min={1}
                max={6}
                value={settings.rulerLines}
                format={String}
                onChange={(rulerLines) => update({ rulerLines })}
              />
              <Range
                label={t("Opacity")}
                min={0.1}
                max={0.9}
                step={0.1}
                value={settings.rulerOpacity}
                format={(v) => v.toFixed(1)}
                onChange={(rulerOpacity) => update({ rulerOpacity })}
              />
              <div className="flex items-center justify-between gap-2">
                <span>{t("Ruler color")}</span>
                <div className="flex gap-1.5">
                  {RULER_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-5 h-5 rounded-full border border-base-300 ${settings.rulerColor === color ? "ring-2 ring-primary" : ""}`}
                      style={{ background: RULER_SWATCHES[color] }}
                      title={color === "transparent" ? t("None") : color}
                      aria-label={t("Ruler {color}", {
                        color: color === "transparent" ? t("no color") : color,
                      })}
                      aria-pressed={settings.rulerColor === color}
                      onClick={() => update({ rulerColor: color })}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
      {!fixedLayout && (
        <Select
          label={t("Translate to")}
          value={settings.translateTo}
          onChange={(translateTo) => update({ translateTo })}
        >
          <option value="">{t("Default")}</option>
          {HUMAN_LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
      )}
      <TranslationSwitches />
      <button
        className="self-end btn btn-ghost btn-xs"
        onClick={() =>
          setReaderSettings({
            ...DEFAULT_READER_SETTINGS,
            // not about the look
            ...Object.fromEntries(
              KEPT_ON_RESET.map((key) => [key, settings[key]]),
            ),
          })
        }
      >
        {t("Reset")}
      </button>
    </div>
  );
}

export default memo(ReaderSettingsMenu);
