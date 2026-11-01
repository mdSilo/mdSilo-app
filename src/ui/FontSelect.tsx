import { useStore } from "@/state/store";
import { BUNDLED_FONTS, GENERIC_FONTS } from "@/custom/fonts";
import { Select } from "./ui";

type Props = {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (id: string) => void;
  /** the default option, e.g. `['', 'Default']` or `['book', 'Of the book']` */
  defaultOption: [string, string];
};

/** One font list for the editor and the reader, with the fonts added in Settings. */
export default function FontSelect({
  label,
  ariaLabel,
  value,
  onChange,
  defaultOption,
}: Props) {
  const customFonts = useStore((state) => state.customFonts);
  return (
    <Select
      label={label}
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
    >
      <option value={defaultOption[0]}>{defaultOption[1]}</option>
      <optgroup label="Generic">
        {GENERIC_FONTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Bundled">
        {BUNDLED_FONTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </optgroup>
      {customFonts.length > 0 ? (
        <optgroup label="Added">
          {customFonts.map((f) => (
            <option key={f.id} value={`custom:${f.id}`}>
              {f.family}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );
}
