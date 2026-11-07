import { useState } from "react";
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
  TbGripVertical,
  TbTrash,
} from "react-icons/tb";
import { store, useStore } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import {
  addSite,
  forgetSource,
  isEnabled,
  moveSource,
  setEnabled,
  useDictionarySettings,
  useDictionarySources,
  type DictionarySettings,
  type DictionarySource,
} from "./dictionary";

const KIND_LABELS = { web: "Web", link: "Link", local: "File" };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const save = (settings: DictionarySettings) =>
  store.getState().setDictionarySettings(settings);

/** The dictionaries to look words up in: which, in what order; sites and files added. */
export default function DictionariesModal() {
  const isOpen = useStore((state) => state.isDictionariesOpen);
  const setIsOpen = useStore((state) => state.setIsDictionariesOpen);
  return (
    <BaseModal
      title="Dictionaries"
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
  const settings = useDictionarySettings();
  const sources = useDictionarySources();
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
          A word is looked up in the dictionaries turned on, a tab for each in
          this order: the first that has the word shows. Drag to reorder.
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
            <ul className="flex flex-col gap-1" aria-label="Dictionaries">
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
                      : undefined
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>
      <MerriamWebsterKey settings={settings} />
      <AddSite settings={settings} />
    </div>
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
}: {
  source: DictionarySource;
  on: boolean;
  first: boolean;
  last: boolean;
  onToggle: (on: boolean) => void;
  onMove: (by: number) => void;
  onRemove?: () => void;
}) {
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
        aria-label={`Drag ${source.label}`}
        {...attributes}
        {...listeners}
      >
        <TbGripVertical />
      </button>
      <input
        type="checkbox"
        className="toggle toggle-sm toggle-primary"
        checked={on}
        aria-label={`Use ${source.label}`}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{source.label}</span>
          <span className="badge badge-xs badge-ghost">
            {KIND_LABELS[source.kind]}
          </span>
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
        aria-label={`Move ${source.label} up`}
        disabled={first}
        onClick={() => onMove(-1)}
      >
        <TbArrowUp />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square"
        aria-label={`Move ${source.label} down`}
        disabled={last}
        onClick={() => onMove(1)}
      >
        <TbArrowDown />
      </button>
      {onRemove ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          aria-label={`Remove ${source.label}`}
          onClick={onRemove}
        >
          <TbTrash />
        </button>
      ) : null}
    </li>
  );
}

function MerriamWebsterKey({ settings }: { settings: DictionarySettings }) {
  const [key, setKey] = useState(settings.merriamWebsterKey ?? "");
  return (
    <section className="flex flex-col gap-1">
      <label className="font-medium" htmlFor="mw-key">
        Merriam-Webster API key
      </label>
      <p className="text-xs text-base-content/70">
        With a key of the Collegiate Dictionary (free for non-commercial use at
        dictionaryapi.com), Merriam-Webster is looked up here, with its
        recordings; without one, it opens the site.
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
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    try {
      save(addSite(settings, name, url));
      setName("");
      setUrl("");
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section className="flex flex-col gap-1">
      <span className="font-medium">Add a site</span>
      <p className="text-xs text-base-content/70">
        Any dictionary on the web, opened in the browser: its url with{" "}
        <code>%WORD%</code> where the word goes, e.g.
      </p>
      <code className="text-xs break-all text-base-content/70">
        https://www.collinsdictionary.com/dictionary/english/%WORD%
      </code>
      <div className="flex flex-wrap gap-2">
        <input
          className="w-32 input input-sm input-bordered"
          placeholder="Name"
          aria-label="Site name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="flex-1 min-w-48 input input-sm input-bordered"
          placeholder="https://…%WORD%…"
          aria-label="Site url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
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
          Add
        </button>
      </div>
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </section>
  );
}
