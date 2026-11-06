import { useEffect, useState } from "react";
import { TbCopy, TbDeviceFloppy, TbPhotoPlus, TbShare } from "react-icons/tb";
import {
  canShareImage,
  copyImage,
  saveImage,
  shareImage,
  type PluginImage,
} from "./image";

/**
 * An image answered by a plugin, with buttons of the app (not of the
 * plugin, whose frame can't reach the clipboard or the files): copy, save,
 * share where the system can, and put in the note if `onInsert`.
 */
export function PluginImageView({
  image,
  onInsert,
  imageClassName = "max-h-72",
}: {
  image: PluginImage;
  /** puts it in the note; throws what went wrong */
  onInsert?: () => Promise<void>;
  imageClassName?: string;
}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(image.blob);
    setUrl(objectUrl);
    setStatus(undefined);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const run = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    try {
      const done = await fn();
      setStatus(done ? { text: done } : undefined);
    } catch (e) {
      // the share sheet closed: nothing to say
      if (e instanceof DOMException && e.name === "AbortError") return;
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const btn = "btn btn-ghost btn-xs";
  return (
    <div className="flex flex-col gap-1">
      {url ? (
        <img
          src={url}
          alt={image.alt}
          className={`object-contain max-w-full mx-auto rounded ${imageClassName}`}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-1">
        {status ? (
          <span
            role="status"
            className={`mr-auto text-xs truncate ${status.error ? "text-error" : "text-base-content/60"}`}
          >
            {status.text}
          </span>
        ) : null}
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await copyImage(image);
              return "Copied";
            })
          }
        >
          <TbCopy /> Copy
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const path = await saveImage(image);
              return path ? `Saved ${path}` : undefined;
            })
          }
        >
          <TbDeviceFloppy /> Save…
        </button>
        {canShareImage(image) ? (
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await shareImage(image);
                return undefined;
              })
            }
          >
            <TbShare /> Share
          </button>
        ) : null}
        {onInsert ? (
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await onInsert();
                return undefined;
              })
            }
          >
            <TbPhotoPlus /> Insert
          </button>
        ) : null}
      </div>
    </div>
  );
}
