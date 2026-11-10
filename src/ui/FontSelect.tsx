import {
  BUNDLED_FONTS,
  GENERIC_FONTS,
  useFonts,
  useSystemFonts,
} from "@/custom/fonts";
import { useT } from "@/i18n";
import { Select } from "./ui";

type Props = {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (id: string) => void;
  /** the default option, e.g. `['', 'Default']` or `['book', 'Of the book']` */
  defaultOption: [string, string];
};

/** One font list for the editor and the reader, with the fonts added in Settings and those of the system. */
export default function FontSelect({
  label,
  ariaLabel,
  value,
  onChange,
  defaultOption,
}: Props) {
  const t = useT();
  const customFonts = useFonts();
  const systemFonts = useSystemFonts();
  // chosen before, the font is shown though it is not listed (yet, or any more)
  const missing =
    value.startsWith("system:") && !systemFonts.includes(value.slice(7))
      ? value.slice(7)
      : "";
  return (
    <Select
      label={label}
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
    >
      <option value={defaultOption[0]}>{defaultOption[1]}</option>
      <optgroup label={t("Generic")}>
        {GENERIC_FONTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("Bundled")}>
        {BUNDLED_FONTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </optgroup>
      {customFonts.length > 0 ? (
        <optgroup label={t("Added")}>
          {customFonts.map((f) => (
            <option key={f.id} value={`custom:${f.id}`}>
              {f.family}
            </option>
          ))}
        </optgroup>
      ) : null}
      {systemFonts.length > 0 || missing ? (
        <optgroup label={t("System")}>
          {missing ? <option value={value}>{missing}</option> : null}
          {systemFonts.map((family) => (
            <option key={family} value={`system:${family}`}>
              {family}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );
}
