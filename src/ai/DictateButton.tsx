import { useEffect, useRef, useState } from "react";
import { TbLoader2, TbMicrophone, TbPlayerStopFilled } from "react-icons/tb";
import { Tooltip } from "@/ui/ui";
import { editorOf } from "@/writer/editors";
import { useT } from "@/i18n";
import { useAiProviders } from "./providers";
import { transcribe } from "./stt";

/** The browser (webview) can record: getUserMedia and MediaRecorder. */
export const canRecord = () =>
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== "undefined";

/** Put text at the cursor of the editor of a note (in place of a selection). */
export function insertAtCursor(noteId: string, text: string): boolean {
  const view = editorOf(noteId)?.view;
  if (!view) return false;
  const { state } = view;
  const before = state.doc.textBetween(
    Math.max(0, state.selection.from - 1),
    state.selection.from,
  );
  // a space between it and a word before
  const spaced = before && !/\s/.test(before) ? ` ${text}` : text;
  view.dispatch(state.tr.insertText(spaced));
  view.focus();
  return true;
}

type State = "idle" | "recording" | "transcribing";

/**
 * Dictation (docs/ai.md, "Audio"): a click records, another stops; the speech
 * sent to the provider of speech to text, its text put at the cursor. Shown
 * only with a provider of it and a webview that can record.
 */
export default function DictateButton({
  noteId,
  className = "",
  iconClass = "",
}: {
  noteId: string;
  className?: string;
  iconClass?: string;
}) {
  const t = useT();
  const loaded = useAiProviders((s) => s.loaded);
  const can = useAiProviders((s) =>
    s.providers.some(
      (p) => p.kind === "openai" && p.settings?.sttModel?.trim(),
    ),
  );
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!loaded)
      void useAiProviders
        .getState()
        .load()
        .catch(() => undefined);
  }, [loaded]);
  // the note left while recording: stopped, nothing sent
  useEffect(
    () => () => {
      const r = recorder.current;
      if (r && r.state !== "inactive") {
        r.ondataavailable = null;
        r.onstop = null;
        r.stop();
        r.stream.getTracks().forEach((track) => track.stop());
      }
    },
    [noteId],
  );

  if (!can || !canRecord()) return null;

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        setState("transcribing");
        try {
          const type = r.mimeType || chunks[0]?.type || "audio/webm";
          const blob = new Blob(chunks, { type });
          const ext = type.includes("mp4")
            ? "m4a"
            : type.includes("ogg")
              ? "ogg"
              : "webm";
          const segments = await transcribe(
            new Uint8Array(await blob.arrayBuffer()),
            {
              name: `dictation.${ext}`,
              type,
            },
          );
          const text = segments
            .map((s) => s.text)
            .join(" ")
            .trim();
          if (text && !insertAtCursor(noteId, text))
            setError(t("No editor to put the text in"));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setState("idle");
        }
      };
      recorder.current = r;
      r.start();
      setState("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const label =
    state === "recording"
      ? t("Stop and put the text in the note")
      : state === "transcribing"
        ? t("Transcribing…")
        : error || t("Dictate");
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={state === "recording"}
        disabled={state === "transcribing"}
        className={`flex items-center justify-center w-8 h-8 ${className}`}
        onClick={() =>
          state === "recording" ? recorder.current?.stop() : void start()
        }
      >
        {state === "recording" ? (
          <TbPlayerStopFilled size={18} className="text-error" />
        ) : state === "transcribing" ? (
          <TbLoader2 size={18} className={`animate-spin ${iconClass}`} />
        ) : (
          <TbMicrophone
            size={18}
            className={error ? "text-error" : iconClass}
          />
        )}
      </button>
    </Tooltip>
  );
}
