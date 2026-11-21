import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { BaseModal } from "@/ui/BaseModal";
import { useT } from "@/i18n";
import { lineDiff, proposeProfile, readProfile, writeProfile } from "./myself";

/** The dialog of the profile, open or not. */
export const useProfileModal = create<{ open: boolean }>(() => ({
  open: false,
}));

/**
 * The profile of the user (docs/ai.md, "Chat with myself"): to read and edit;
 * an update proposed by the model shown as a change, taken or not, never
 * written on its own.
 */
export default function ProfileModal() {
  const t = useT();
  const open = useProfileModal((s) => s.open);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [proposed, setProposed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setProposed(null);
    setMessage("");
    void readProfile().then((p) => {
      setText(p);
      setSaved(p);
    });
  }, [open]);

  const close = () => {
    controller.current?.abort();
    useProfileModal.setState({ open: false });
  };
  const save = async (value: string) => {
    try {
      await writeProfile(value);
      setText(value);
      setSaved(value);
      setMessage(t("Saved"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  const propose = async () => {
    setBusy(true);
    setMessage("");
    controller.current = new AbortController();
    try {
      setProposed(await proposeProfile(controller.current.signal));
    } catch (e) {
      if (!controller.current.signal.aborted)
        setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal
      title={t("My profile")}
      isOpen={open}
      handleClose={close}
      scrollBody
    >
      <div
        className="flex flex-col gap-2 p-3 text-sm text-left bg-base-200"
        data-testid="profile"
      >
        <p className="text-xs text-base-content/70">
          {t(
            "What your own notes say of you, given to the chat with all your notes. Kept in the workspace (.mdsilo/ai/profile.md); edit it as you like. An update is only proposed: you take it or not.",
          )}
        </p>
        {proposed === null ? (
          <>
            <textarea
              className="font-mono textarea textarea-sm min-h-60"
              aria-label={t("My profile")}
              value={text}
              placeholder={t("No profile yet: propose one from your notes.")}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-xs"
                disabled={busy}
                onClick={() => void propose()}
              >
                {busy
                  ? t("Reading your notes…")
                  : saved.trim()
                    ? t("Propose an update")
                    : t("Propose a profile")}
              </button>
              <button
                type="button"
                className="btn btn-xs"
                disabled={text === saved}
                onClick={() => void save(text)}
              >
                {t("Save")}
              </button>
              {message ? (
                <span className="text-xs text-base-content/70">{message}</span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <pre
              className="p-2 overflow-auto text-xs whitespace-pre-wrap rounded max-h-96 bg-base-100"
              data-testid="profile-diff"
            >
              {lineDiff(saved, proposed).map((d, i) => (
                <div
                  key={i}
                  className={
                    d.type === "add"
                      ? "bg-success/20"
                      : d.type === "del"
                        ? "bg-error/20 line-through"
                        : ""
                  }
                >
                  {d.type === "add" ? "+ " : d.type === "del" ? "- " : "  "}
                  {d.line}
                </div>
              ))}
            </pre>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => {
                  const value = proposed;
                  setProposed(null);
                  void save(value);
                }}
              >
                {t("Take it")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setProposed(null)}
              >
                {t("Discard")}
              </button>
            </div>
          </>
        )}
      </div>
    </BaseModal>
  );
}
