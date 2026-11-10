import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { PublishOptions } from "mdsilo-publish";
import { useStore } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import { Spinner, Toggle } from "@/ui/ui";
import { checkFileIsMd } from "@/workspace/process";
import { syncInfo } from "@/sync/api";
import { useIssueStore } from "@/issue/issueStore";
import { t, tk, tn, tr, useT } from "@/i18n";
import {
  buildSiteTo,
  noteFolders,
  publishSite,
  readPublishOptions,
  relativeTo,
  usePublishUi,
  writePublishOptions,
  type Built,
  type Pushed,
} from "./publish";

type Kind =
  | "backlinks"
  | "graph"
  | "tags"
  | "books"
  | "issues"
  | "journals"
  | "math"
  | "mermaid"
  | "echarts"
  | "smiles";

const CONTENT: [Kind, string, string][] = [
  ["backlinks", tk("Backlinks"), tk("the published notes linking to a note")],
  ["graph", tk("Graph"), tk("the links between the pages")],
  ["tags", tk("Tag pages"), tk("a page per #tag#")],
  ["journals", tk("Journals"), tk("the daily notes, on the home page")],
  [
    "books",
    tk("Book annotations"),
    tk("the highlights and notes of every annotated book, not the books"),
  ],
  [
    "issues",
    tk("Issues"),
    tk("with their timeline, milestones and project boards"),
  ],
];

/** Drawn when publishing, so the site loads no library. */
const DRAWN: [Kind, string, string][] = [
  ["math", tk("Math"), tk("$...$ and $$...$$, as MathML")],
  ["mermaid", tk("Mermaid"), tk("diagrams, as pictures")],
  ["echarts", tk("ECharts"), tk("charts, as pictures")],
  ["smiles", tk("SMILES"), tk("chemical structures, as pictures")],
];

/** Choose what to publish, then export the site or push it to GitHub Pages. */
export default function PublishModal() {
  const t = useT();
  const isOpen = usePublishUi((s) => s.isOpen);
  const ws = useStore((state) => state.initDir);
  const notes = useStore((state) => state.notes);
  const [options, setOptions] = useState<PublishOptions>();
  const [canPush, setCanPush] = useState(false);
  const [busy, setBusy] = useState<"export" | "publish">();
  const [result, setResult] = useState<
    (Built & Partial<Pushed>) & { target?: string }
  >();
  const [error, setError] = useState<string>();
  const handleClose = () => usePublishUi.setState({ isOpen: false });
  const labels = useIssueStore((s) => s.data.labels);

  useEffect(() => {
    if (!isOpen || !ws) return;
    setResult(undefined);
    setError(undefined);
    void readPublishOptions(ws).then(setOptions);
    void useIssueStore.getState().load(ws);
    void syncInfo(ws)
      .then((info) => setCanPush(Boolean(info.isRepo && info.remoteUrl)))
      .catch(() => setCanPush(false));
  }, [isOpen, ws]);

  const folders = useMemo(
    () => (isOpen && ws ? noteFolders(ws, notes.values()) : []),
    [isOpen, ws, notes],
  );
  // before the front matter is read: the notes in the folders ticked
  const count = useMemo(() => {
    if (!ws || !options) return 0;
    const ticked = options.folders.map((f) => `${f}/`);
    return notes.values().filter((n) => {
      const path =
        !n.is_dir && checkFileIsMd(n.id) ? relativeTo(ws, n.id) : undefined;
      return path && ticked.some((f) => path.startsWith(f));
    }).length;
  }, [ws, options, notes]);

  if (!ws) return null;

  const update = (next: PublishOptions) => {
    setOptions(next);
    void writePublishOptions(ws, next).catch((e) => setError(String(e)));
  };
  const toggleFolder = (folder: string, on: boolean) => {
    if (!options) return;
    // a folder ticked has its sub folders: they go with it
    const rest = options.folders.filter(
      (f) => f !== folder && !f.startsWith(`${folder}/`),
    );
    update({ ...options, folders: on ? [...rest, folder].sort() : rest });
  };
  const isTicked = (folder: string) =>
    options?.folders.some((f) => folder === f || folder.startsWith(`${f}/`)) ??
    false;
  const run = async (kind: "export" | "publish") => {
    if (!options) return;
    setError(undefined);
    setResult(undefined);
    try {
      if (kind === "export") {
        const target = await open({
          directory: true,
          title: t("Export the site to"),
        });
        if (typeof target !== "string") return;
        setBusy(kind);
        setResult({ ...(await buildSiteTo(ws, options, target)), target });
      } else {
        setBusy(kind);
        setResult(await publishSite(ws, options));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <BaseModal
      title={t("Publish")}
      isOpen={isOpen}
      handleClose={handleClose}
      panelClassName="max-w-md"
    >
      {options ? (
        <div className="flex flex-col gap-3 p-3 text-sm text-left bg-base-200">
          <p className="text-base-content/80">
            {tr(
              "A static site of the notes in the folders ticked. A note can opt out with {off} in its front matter, or in from elsewhere with {on}. Links to notes not published show as plain text.",
              {
                off: <code>publish: false</code>,
                on: <code>publish: true</code>,
              },
            )}
          </p>
          <label className="flex flex-col gap-1">
            <span>{t("Site title")}</span>
            <input
              className="input input-sm w-full"
              value={options.title}
              onChange={(e) =>
                setOptions({ ...options, title: e.target.value })
              }
              onBlur={() => update(options)}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span>
              {t("Folders")}{" "}
              <span className="text-base-content/70">
                ({tn("{count} note", "{count} notes", count)})
              </span>
            </span>
            <div className="flex flex-col max-h-48 overflow-y-auto p-2 rounded-sm bg-base-100">
              {folders.length ? (
                folders.map((folder) => {
                  const depth = folder.split("/").length - 1;
                  const parentTicked =
                    depth > 0 &&
                    isTicked(folder.split("/").slice(0, -1).join("/"));
                  return (
                    <label
                      key={folder}
                      className="flex items-center gap-2"
                      style={{ paddingLeft: `${depth}em` }}
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={isTicked(folder)}
                        disabled={parentTicked}
                        onChange={(e) => toggleFolder(folder, e.target.checked)}
                      />
                      {folder.split("/").pop()}
                    </label>
                  );
                })
              ) : (
                <span className="text-base-content/70">
                  {t("No folders of notes")}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span>{t("With")}</span>
            {CONTENT.map(([kind, name, hint]) => (
              <Toggle
                key={kind}
                label={
                  <span>
                    {t(name)}{" "}
                    <span className="text-xs text-base-content/70">
                      {t(hint)}
                    </span>
                  </span>
                }
                ariaLabel={t(name)}
                checked={options[kind] as boolean}
                onChange={(on) => update({ ...options, [kind]: on })}
              />
            ))}
          </div>

          {options.issues && labels.length ? (
            <div className="flex flex-col gap-1">
              <span>
                {t("Only the issues labeled")}{" "}
                <span className="text-base-content/70">
                  {t("(none ticked: all issues)")}
                </span>
              </span>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {labels.map((label) => (
                  <label key={label.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={options.issueLabels.includes(label.name)}
                      onChange={(e) => {
                        const rest = options.issueLabels.filter(
                          (l) => l !== label.name,
                        );
                        update({
                          ...options,
                          issueLabels: e.target.checked
                            ? [...rest, label.name]
                            : rest,
                        });
                      }}
                    />
                    {label.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span>{t("Draw")}</span>
            {DRAWN.map(([kind, name, hint]) => (
              <Toggle
                key={kind}
                label={
                  <span>
                    {t(name)}{" "}
                    <span className="text-xs text-base-content/70">
                      {t(hint)}
                    </span>
                  </span>
                }
                ariaLabel={t(name)}
                checked={options[kind] as boolean}
                onChange={(on) => update({ ...options, [kind]: on })}
              />
            ))}
          </div>

          {error ? (
            <div role="alert" className="break-words text-error">
              {error}
            </div>
          ) : null}
          {result ? <Result result={result} /> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="btn btn-sm"
              disabled={!!busy}
              onClick={() => void run("export")}
            >
              {busy === "export" ? <Spinner size="xs" color="neutral" /> : null}
              {t("Export to folder…")}
            </button>
            <button
              className="btn btn-sm btn-primary"
              disabled={!!busy || !canPush}
              title={
                canPush
                  ? undefined
                  : t("Set up the sync first: the site goes to its remote")
              }
              onClick={() => void run("publish")}
            >
              {busy === "publish" ? (
                <Spinner size="xs" color="neutral" />
              ) : null}
              {t("Publish to GitHub Pages")}
            </button>
          </div>
          {!canPush ? (
            <p className="text-xs text-base-content/70">
              {t(
                "To publish, set up the sync: the site goes to the gh-pages branch of its remote.",
              )}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="p-3">
          <Spinner size="sm" />
        </div>
      )}
    </BaseModal>
  );
}

function Result({
  result,
}: {
  result: Built & Partial<Pushed> & { target?: string };
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-success">
        {result.branch
          ? tn(
              "{count} page pushed to {branch}",
              "{count} pages pushed to {branch}",
              result.pages,
              { branch: result.branch },
            )
          : tn(
              "{count} page written to {target}",
              "{count} pages written to {target}",
              result.pages,
              { target: result.target ?? "" },
            )}
      </span>
      {result.url ? (
        <span>
          <button
            className="link link-primary"
            onClick={() => void invoke("open_url", { url: result.url })}
          >
            {result.url}
          </button>
          <span className="block text-xs text-base-content/70">
            {t(
              "Once: in the repository settings, Pages, deploy from the branch gh-pages. Then it may take a minute.",
            )}
          </span>
        </span>
      ) : null}
      {result.missing.length ? (
        <span className="text-xs text-warning">
          {t("Not found, left out:")} {result.missing.join(", ")}
        </span>
      ) : null}
    </div>
  );
}
