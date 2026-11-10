import { useStore } from "@/state/store";
import { Range, Toggle } from "@/ui/ui";
import FontSelect from "@/ui/FontSelect";
import { t, useT } from "@/i18n";

/** How notes are written and shown: font, spacing, direction, assets, spelling. */
export default function EditorSettings() {
  const t = useT();
  const font = useStore((state) => state.font);
  const setFont = useStore((state) => state.setFont);
  const codeFont = useStore((state) => state.codeFont);
  const setCodeFont = useStore((state) => state.setCodeFont);
  const cjkFont = useStore((state) => state.cjkFont);
  const setCjkFont = useStore((state) => state.setCjkFont);
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
    <div
      className="flex flex-col gap-3 p-3 text-sm w-72"
      data-testid="editor-settings"
    >
      <FontSelect
        label={t("Font")}
        ariaLabel={t("Editor Font Family")}
        value={font}
        onChange={setFont}
        defaultOption={["", t("Default")]}
      />
      <FontSelect
        label={t("Code Font")}
        ariaLabel={t("Editor Code Font Family")}
        value={codeFont}
        onChange={setCodeFont}
        defaultOption={["", t("Default")]}
      />
      <FontSelect
        label={t("CJK Font")}
        ariaLabel={t("Editor CJK Font Family")}
        value={cjkFont}
        onChange={setCjkFont}
        defaultOption={["", t("None")]}
      />
      <Range
        label={t("Font Size")}
        min={0.8}
        max={2}
        step={0.1}
        value={fontSize}
        format={(v) => `${v.toFixed(1)}em`}
        onChange={setFontSize}
      />
      <Range
        label={t("Line Height")}
        min={1}
        max={2.4}
        step={0.1}
        value={lineHeight}
        format={(v) => v.toFixed(1)}
        onChange={setLineHeight}
      />
      <Range
        label={t("Font Weight")}
        min={100}
        max={900}
        step={100}
        value={fontWt}
        onChange={setFontWt}
      />
      <Toggle label={t("Right to Left")} checked={isRTL} onChange={setIsRTL} />
      <Toggle
        label={t("Spell Check")}
        checked={isCheckSpellOn}
        onChange={setIsCheckSpellOn}
      />
      <div className="flex flex-col gap-1">
        <Toggle
          label={t("Use Assets Folder")}
          checked={useAsset}
          onChange={setUseAsset}
        />
        <p className="text-xs text-base-content/70">
          {t("To store images, files and support relative path")}
        </p>
      </div>
    </div>
  );
}
