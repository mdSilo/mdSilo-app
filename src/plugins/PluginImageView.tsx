import { useEffect, useState, type ReactNode } from "react";
import {
  TbCopy,
  TbDeviceFloppy,
  TbExternalLink,
  TbPhotoPlus,
  TbShare,
} from "react-icons/tb";
import { openUrl } from "@/workspace/open";
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
 * share where the system can, and put in the note if `onInsert`; and the
 * links of the plugin (e.g. to post it), opened in the browser on a click.
 * The image on the left, the buttons in a column by it; below it when narrow.
 */
export function PluginImageView({
  image,
  onInsert,
  imageWidth = 220,
}: {
  image: PluginImage;
  /** puts it in the note; throws what went wrong */
  onInsert?: () => Promise<void>;
  /** px, at most: the image keeps its proportions */
  imageWidth?: number;
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

  const action = (
    icon: ReactNode,
    label: string,
    fn: () => Promise<string | undefined>,
    primary = false,
  ) => (
    <button
      type="button"
      className={`btn btn-sm justify-start w-full font-normal ${primary ? "btn-primary" : "btn-ghost"}`}
      disabled={busy}
      onClick={() => void run(fn)}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-start gap-3">
      {url ? (
        <img
          src={url}
          alt={image.alt}
          className="h-auto max-w-full border rounded-md shadow-sm border-base-300"
          style={{ width: imageWidth }}
        />
      ) : null}
      <div className="flex flex-col flex-1 gap-0.5 min-w-36">
        {action(<TbCopy size={16} />, "Copy", async () => {
          await copyImage(image);
          return "Copied";
        })}
        {action(<TbDeviceFloppy size={16} />, "Save…", async () => {
          const path = await saveImage(image);
          return path ? `Saved ${path}` : undefined;
        })}
        {canShareImage(image)
          ? action(<TbShare size={16} />, "Share…", async () => {
              await shareImage(image);
              return undefined;
            })
          : null}
        {onInsert
          ? action(
              <TbPhotoPlus size={16} />,
              "Insert in note",
              async () => {
                await onInsert();
                return undefined;
              },
              true,
            )
          : null}
        {image.links.length ? (
          <>
            <div className="mx-3 my-1 border-t border-base-300" />
            {image.links.map((link) => (
              <button
                key={link.url}
                type="button"
                className="justify-start w-full font-normal btn btn-sm btn-ghost flex-nowrap"
                title={`${link.title}\n${link.url}`}
                onClick={() => void openUrl(link.url)}
              >
                <TbExternalLink size={16} className="shrink-0" />
                <span className="truncate">{link.title}</span>
              </button>
            ))}
          </>
        ) : null}
        {status ? (
          <div
            role="status"
            className={`px-3 pt-1 text-xs break-all ${status.error ? "text-error" : "text-base-content/60"}`}
          >
            {status.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
