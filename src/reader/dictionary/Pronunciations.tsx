import { TbVolume, TbVolumeOff } from "react-icons/tb";
import type { Pronunciation } from "../lookup/lookup";
import { playRecording } from "./audio";
import { useLocalDictionaries } from "./local";

/** The dictionary file of a recording of one, `mdict:<id>:<path>`; none of the web. */
const fileOf = (audio: string) =>
  audio.startsWith("mdict:") ? audio.split(":")[1] : undefined;

/**
 * The ways a word is said: the spelling, a button to play each recording.
 * A recording of a dictionary file not on this device cannot be played.
 */
export default function Pronunciations({
  list,
  className = "ml-1",
}: {
  list?: Pronunciation[];
  className?: string;
}) {
  const here = useLocalDictionaries((state) => state.here);
  if (!list?.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {list.map((p, i) => {
        const label = p.label ? ` (${p.label})` : "";
        if (!p.audio)
          return p.text ? (
            <span key={i} className="text-xs opacity-70">
              {p.text}
            </span>
          ) : null;
        const file = fileOf(p.audio);
        const away = Boolean(file && !here[file]);
        return (
          <button
            key={i}
            type="button"
            className="h-auto min-h-0 px-1 py-0 font-normal btn btn-ghost btn-xs"
            title={
              away
                ? "Its dictionary file is not on this device"
                : `Play${label}`
            }
            aria-label={`Play the pronunciation${label}`}
            disabled={away}
            onClick={(e) => {
              e.stopPropagation();
              void playRecording(p.audio!);
            }}
          >
            {away ? <TbVolumeOff /> : <TbVolume />}
            {p.label ? <span className="text-xs">{p.label}</span> : null}
            {p.text ? <span className="text-xs">{p.text}</span> : null}
          </button>
        );
      })}
    </span>
  );
}
