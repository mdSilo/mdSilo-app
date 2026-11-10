import { useRef, useState, type ReactNode } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  TbArrowDown,
  TbArrowUp,
  TbCloud,
  TbCloudOff,
  TbGripVertical,
  TbTrash,
} from "react-icons/tb";
import { store, useStore } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import { Spinner } from "@/ui/ui";
import { openFileDilog } from "@/workspace/open";
import { isTauri } from "@/workspace/util";
import { t, tk, tr, useT } from "@/i18n";
import {
  addSite,
  forgetSource,
  isEnabled,
  localSourceId,
  localSources,
  moveSource,
  orderedSources,
  putFirst,
  setEnabled,
  useDictionarySettings,
  useDictionaryWorkspace,
  useDictionarySources,
  withDictionaryDefaults,
  type DictionarySettings,
  type DictionarySource,
} from "./dictionary";
import {
  DICTIONARY_FILE_TYPES,
  importDictionaries,
  removeDictionary,
  setDictionarySynced,
  useLocalDictionaries,
  type LocalDictionary,
  type PickedFile,
} from "./local";

const KIND_LABELS = { web: tk("Web"), link: tk("Link"), local: tk("File") };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const save = (settings: DictionarySettings) =>
  store.getState().setDictionarySettings(settings);

/** The dictionaries to look words up in: which, in what order; sites and files added. */
export default function DictionariesModal() {
  const t = useT();
  const isOpen = useStore((state) => state.isDictionariesOpen);
  const setIsOpen = useStore((state) => state.setIsDictionariesOpen);
  return (
    <BaseModal
      title={t("Dictionaries")}
      scrollBody
      isOpen={isOpen}
      handleClose={() => setIsOpen(false)}
    >
      <div className="p-3 text-sm text-left bg-base-200">
        {isOpen ? <DictionariesSetting /> : null}
      </div>
    </BaseModal>
  );
}

export function DictionariesSetting() {
  const t = useT();
  const settings = useDictionarySettings();
  const ws = useDictionaryWorkspace();
  const sources = useDictionarySources(ws);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const move = (id: string, to: number) =>
    save(moveSource(settings, sources, id, to));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      String(active.id),
      sources.findIndex((s) => s.id === over.id),
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="dictionaries-setting">
      <section className="flex flex-col gap-2">
        <p className="text-xs text-base-content/70">
          {t(
            "A word is looked up in the dictionaries turned on, a tab for each in this order: the first that has the word shows. Drag to reorder.",
          )}
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={sources.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1" aria-label={t("Dictionaries")}>
              {sources.map((source, i) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  on={isEnabled(settings, source.id)}
                  first={i === 0}
                  last={i === sources.length - 1}
                  onToggle={(on) => save(setEnabled(settings, source.id, on))}
                  onMove={(by) => move(source.id, i + by)}
                  onRemove={
                    source.id.startsWith("web:")
                      ? () => save(forgetSource(settings, source.id))
                      : source.dict && ws
                        ? () => void remove(ws, source.dict!)
                        : undefined
                  }
                  extra={
                    source.dict && ws && !source.missing ? (
                      <SyncButton ws={ws} dict={source.dict} />
                    ) : null
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>
      <ImportFiles ws={ws} />
      <MerriamWebsterKey settings={settings} />
      <AddSite settings={settings} />
    </div>
  );
}

/** Remove a dictionary file, asked first: its files deleted. */
async function remove(ws: string, dict: LocalDictionary) {
  const ok = await ask(
    dict.synced
      ? t(
          "Remove the dictionary “{name}”? Its files are deleted from the workspace (and from the other devices, once synced).",
          { name: dict.name },
        )
      : t(
          "Remove the dictionary “{name}”? Its files are deleted from the workspace.",
          { name: dict.name },
        ),
    { title: t("Remove dictionary"), kind: "warning" },
  );
  if (!ok) return;
  await removeDictionary(ws, dict.id);
  const { dictionarySettings } = store.getState();
  save(
    forgetSource(
      withDictionaryDefaults(dictionarySettings),
      localSourceId(dict.id),
    ),
  );
}

/** Sync the files of a dictionary with the workspace (git), or not; big ones asked first. */
function SyncButton({ ws, dict }: { ws: string; dict: LocalDictionary }) {
  const t = useT();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs btn-square"
      title={
        dict.synced
          ? t("Its files are synced: stop syncing them")
          : t("Its files are not synced: sync them too")
      }
      aria-label={
        dict.synced
          ? t("Stop syncing {name}", { name: dict.name })
          : t("Sync {name}", { name: dict.name })
      }
      aria-pressed={Boolean(dict.synced)}
      onClick={() => void setDictionarySynced(ws, dict, !dict.synced)}
    >
      {dict.synced ? <TbCloud /> : <TbCloudOff />}
    </button>
  );
}

/** Import dictionary files (MDict) into the workspace, not synced unless chosen. */
function ImportFiles({ ws }: { ws?: string }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();

  const run = async (files: PickedFile[]) => {
    if (!ws || !files.length) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const { added, failed } = await importDictionaries(ws, files);
      // the new ones first: a dictionary is imported to be used
      if (added.length) {
        const { list, here } = useLocalDictionaries.getState();
        const settings = withDictionaryDefaults(
          store.getState().dictionarySettings,
        );
        save(
          putFirst(
            settings,
            orderedSources(settings, localSources(ws, list, here)),
            added.map((d) => localSourceId(d.id)),
          ),
        );
      }
      const lines = [
        ...(added.length
          ? [`Imported: ${added.map((d) => d.name).join(", ")}`]
          : []),
        ...failed.map((f) => `${f.name}: ${f.error}`),
      ];
      setMessage({ error: failed.length > 0, text: lines.join("\n") });
    } catch (e) {
      setMessage({ error: true, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    if (!isTauri) {
      inputRef.current?.click();
      return;
    }
    const paths = await openFileDilog(DICTIONARY_FILE_TYPES, true);
    const list = Array.isArray(paths) ? paths : paths ? [paths] : [];
    await run(
      list.map((path) => ({ name: path.split(/[/\\]/).pop() ?? path, path })),
    );
  };

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t("Dictionary files")}</span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!ws || busy}
          onClick={() => void pick()}
        >
          {busy ? <Spinner size="xs" /> : null} {t("Import")}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          data-testid="dictionary-files"
          accept={DICTIONARY_FILE_TYPES.map((t) => `.${t}`).join(",")}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void run(files.map((file) => ({ name: file.name, file })));
          }}
        />
      </div>
      <p className="text-xs text-base-content/70">
        {ws
          ? t(
              "MDict: pick the .mdx with its .mdd (pictures, sounds) and .css. They are kept in the workspace, not synced unless you turn it on (the cloud of a dictionary).",
            )
          : t(
              "Open a workspace to import dictionary files: they are kept in it.",
            )}
      </p>
      {message ? (
        <p
          className={`text-xs whitespace-pre-line ${message.error ? "text-error" : "text-success"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

function SourceRow({
  source,
  on,
  first,
  last,
  onToggle,
  onMove,
  onRemove,
  extra,
}: {
  source: DictionarySource;
  on: boolean;
  first: boolean;
  last: boolean;
  onToggle: (on: boolean) => void;
  onMove: (by: number) => void;
  onRemove?: () => void;
  extra?: ReactNode;
}) {
  const t = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 p-2 rounded-box bg-base-100 ${isDragging ? "z-10 shadow-lg" : ""}`}
      data-testid={`dictionary-${source.id}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="cursor-grab text-base-content/50 touch-none"
        aria-label={t("Drag {label}", { label: source.label })}
        {...attributes}
        {...listeners}
      >
        <TbGripVertical />
      </button>
      <input
        type="checkbox"
        className="toggle toggle-sm toggle-primary"
        checked={on}
        aria-label={t("Use {label}", { label: source.label })}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{source.label}</span>
          <span className="badge badge-xs badge-ghost">
            {t(KIND_LABELS[source.kind])}
          </span>
          {source.missing ? (
            <span className="badge badge-xs badge-warning">
              {t("Not here")}
            </span>
          ) : null}
        </div>
        {source.description ? (
          <div className="text-xs truncate text-base-content/60">
            {source.description}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square"
        aria-label={t("Move {label} up", { label: source.label })}
        disabled={first}
        onClick={() => onMove(-1)}
      >
        <TbArrowUp />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square"
        aria-label={t("Move {label} down", { label: source.label })}
        disabled={last}
        onClick={() => onMove(1)}
      >
        <TbArrowDown />
      </button>
      {extra}
      {onRemove ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          aria-label={t("Remove {label}", { label: source.label })}
          onClick={onRemove}
        >
          <TbTrash />
        </button>
      ) : null}
    </li>
  );
}

function MerriamWebsterKey({ settings }: { settings: DictionarySettings }) {
  const t = useT();
  const [key, setKey] = useState(settings.merriamWebsterKey ?? "");
  return (
    <section className="flex flex-col gap-1">
      <label className="font-medium" htmlFor="mw-key">
        {t("Merriam-Webster API key")}
      </label>
      <p className="text-xs text-base-content/70">
        {t(
          "With a key of the Collegiate Dictionary (free for non-commercial use at dictionaryapi.com), Merriam-Webster is looked up here, with its recordings; without one, it opens the site.",
        )}
      </p>
      <input
        id="mw-key"
        type="password"
        autoComplete="off"
        className="input input-sm input-bordered"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onBlur={() => {
          if (key.trim() !== (settings.merriamWebsterKey ?? ""))
            save({ ...settings, merriamWebsterKey: key.trim() || undefined });
        }}
      />
    </section>
  );
}

function AddSite({ settings }: { settings: DictionarySettings }) {
  const t = useT();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    try {
      save(addSite(settings, name, url, key));
      setName("");
      setUrl("");
      setKey("");
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section className="flex flex-col gap-1">
      <span className="font-medium">{t("Add a site")}</span>
      <p className="text-xs text-base-content/70">
        {tr(
          "Any dictionary on the web, opened in the browser: its url with {word} where the word goes, e.g.",
          { word: <code>%WORD%</code> },
        )}
      </p>
      <code className="text-xs break-all text-base-content/70">
        https://www.collinsdictionary.com/dictionary/english/%WORD%
      </code>
      <p className="text-xs text-base-content/70">
        {tr(
          "With an API key, optional: {key} where it goes in the url, and the word is looked up here when the site answers as Merriam-Webster's do (its Learner's, Medical… at dictionaryapi.com); else the link opens. E.g.",
          { key: <code>%KEY%</code> },
        )}
      </p>
      <code className="text-xs break-all text-base-content/70">
        https://www.dictionaryapi.com/api/v3/references/learners/json/%WORD%?key=%KEY%
      </code>
      <div className="flex flex-wrap gap-2">
        <input
          className="w-32 input input-sm input-bordered"
          placeholder={t("Name")}
          aria-label={t("Site name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="flex-1 min-w-48 input input-sm input-bordered"
          placeholder="https://…%WORD%…"
          aria-label={t("Site url")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <input
          type="password"
          autoComplete="off"
          className="w-40 input input-sm input-bordered"
          placeholder={t("API key (optional)")}
          aria-label={t("Site API key")}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={!url.trim()}
          onClick={add}
        >
          {t("Add")}
        </button>
      </div>
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </section>
  );
}
