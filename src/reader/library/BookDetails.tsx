import { useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import copy from "copy-to-clipboard";
import {
  TbAppWindow,
  TbBook,
  TbBookmarks,
  TbCloud,
  TbCloudOff,
  TbFilePencil,
  TbLink,
  TbNotes,
  TbPencil,
  TbPhoto,
  TbPhotoOff,
  TbRestore,
  TbRss,
  TbTrash,
} from "react-icons/tb";
import { BaseModal } from "@/ui/BaseModal";
import { IconButton, Spinner } from "@/ui/ui";
import { openFileDilog, openFilePath } from "@/workspace/open";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { canOpenBookWindow, readBook } from "@/shell/windows";
import { renamePath } from "@/workspace/renamePath";
import { sanitizeHtml } from "@/lib/sanitize";
import { t, tk, tr, useT } from "@/i18n";
import { annotationsPathOf, bookHref } from "../annotations/annotations";
import { COVER_EXTS, coverUrl, deleteCovers, setCustomCover } from "./covers";
import { formOf, metaOfForm, validateMeta, type Form } from "./metaForm";
import { allGroups, formatSeries, STATUSES, type ShelfBook } from "./shelf";
import { formatDuration, totalSeconds } from "./stats";
import BookCover from "./BookCover";
import { bookRenameOptions } from "./bookFile";
import { useLibrarySettings } from "./ViewMenu";
import {
  deleteBook,
  normalizeGroup,
  saveBookEntry,
  confirmBooksSync,
  setBookSynced,
  type BookEntry,
} from "./library";

type Props = {
  ws: string;
  book: ShelfBook;
  /** all the books, for the groups to choose from */
  books: ShelfBook[];
  cover?: string;
  onClose: () => void;
  /** the library changed: to load again */
  onChanged: () => void;
};

type Mode = "view" | "edit" | "mark" | "rename" | "delete";

/** A book of the library: its details; its metadata edited; its group and status; deleted. */
export default function BookDetails({
  ws,
  book,
  books,
  cover,
  onClose,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const title = {
    view: t("Book details"),
    edit: t("Edit metadata"),
    mark: t("Group and status"),
    rename: t("Rename the file"),
    delete: t("Delete the book"),
  }[mode];
  const done = () => {
    setMode("view");
    onChanged();
  };
  return (
    <BaseModal
      title={title}
      isOpen
      handleClose={onClose}
      panelClassName="max-w-xl"
    >
      <div className="text-left" data-testid="book-details">
        {mode === "edit" ? (
          <EditMeta
            ws={ws}
            book={book}
            cover={cover}
            onCancel={() => setMode("view")}
            onSaved={done}
          />
        ) : mode === "mark" ? (
          <MarkBook
            ws={ws}
            book={book}
            books={books}
            onCancel={() => setMode("view")}
            onSaved={done}
          />
        ) : mode === "rename" ? (
          <RenameBook
            book={book}
            onCancel={() => setMode("view")}
            onRenamed={done}
          />
        ) : mode === "delete" ? (
          <DeleteBook
            ws={ws}
            book={book}
            onCancel={() => setMode("view")}
            onDeleted={() => {
              onClose();
              onChanged();
            }}
          />
        ) : (
          <ViewBook
            ws={ws}
            book={book}
            cover={cover}
            onMode={setMode}
            onClose={onClose}
            onChanged={onChanged}
          />
        )}
      </div>
    </BaseModal>
  );
}

function ViewBook({
  ws,
  book,
  cover,
  onMode,
  onClose,
  onChanged,
}: {
  ws: string;
  book: ShelfBook;
  cover?: string;
  onMode: (mode: Mode) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const { dispatch } = useCurrentViewContext();
  const [{ openIn }] = useLibrarySettings();
  const read = (inWindow: boolean) => {
    onClose();
    readBook(dispatch, book.path, inWindow);
  };
  const [size, setSize] = useState<number | undefined>();
  const [hasNotes, setHasNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  // the feed fetched again: what it is at, then what it did
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState("");
  const [updated, setUpdated] = useState<{ text: string; error?: boolean }>();
  const updateFromFeed = async () => {
    setUpdating(true);
    setProgress(t("Fetching the feed…"));
    setUpdated(undefined);
    try {
      // the feed code loaded only when used
      const [{ updateFeedBook }, { summaryOf, progressText }] =
        await Promise.all([
          import("@/feed/feedToBook"),
          import("@/feed/MakeBook"),
        ]);
      const report = await updateFeedBook(book.hash, (done, total, stage) =>
        setProgress(progressText(done, total, stage)),
      );
      setUpdated({ text: summaryOf(report) });
      onChanged();
    } catch (e) {
      setUpdated({
        text: e instanceof Error ? e.message : String(e),
        error: true,
      });
    } finally {
      setUpdating(false);
      setProgress("");
    }
  };
  const notesPath = annotationsPathOf(book.path);
  useEffect(() => {
    if (!book.here) return;
    invoke<{ size?: number }>("get_file_meta", { filePath: book.path })
      .then((meta) => setSize(meta?.size))
      .catch(() => undefined);
    invoke<boolean>("file_exist", { filePath: notesPath })
      .then(setHasNotes)
      .catch(() => undefined);
  }, [book.path, book.here, notesPath]);

  const seconds = totalSeconds(book.state?.time);
  const fields: [string, ReactNode][] = [
    [t("Publisher"), book.publisher],
    [t("Published"), book.published],
    [t("Language"), book.language?.join(", ")],
    [t("Identifier"), book.identifier],
    [t("Format"), book.format],
    [t("File size"), size !== undefined ? formatBytes(size) : undefined],
    [
      t("Progress"),
      book.state?.fraction
        ? `${Math.round(book.state.fraction * 100)}%`
        : undefined,
    ],
    [t("Reading time"), seconds > 0 ? formatDuration(seconds) : undefined],
    [t("Last read"), formatDate(book.state?.updatedAt)],
    [t("Added"), formatDate(book.addedAt)],
    [t("Subjects"), book.subjects?.join(", ")],
  ];

  return (
    <>
      <div className="flex gap-4 mb-4">
        <div className="w-24 shrink-0 aspect-28/41">
          <BookCover book={book} url={cover} />
        </div>
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="text-lg font-bold break-words line-clamp-2">
            {book.title || t("Untitled")}
          </div>
          {book.subtitle ? (
            <div className="text-base-content/70 line-clamp-1">
              {book.subtitle}
            </div>
          ) : null}
          {book.series ? (
            <div className="text-sm text-base-content/70">
              {formatSeries(book)}
            </div>
          ) : null}
          <div className="text-base-content/70 line-clamp-1">
            {book.author || t("Unknown author")}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {book.group ? (
              <span className="badge badge-sm badge-ghost">{book.group}</span>
            ) : null}
            {book.status ? (
              <span className="badge badge-sm badge-primary badge-soft">
                {book.status}
              </span>
            ) : null}
            {!book.here ? (
              <span className="badge badge-sm badge-warning badge-soft">
                {t("Not on this device")}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1 mt-auto">
            {book.here ? (
              <Action
                title={t("Read")}
                onClick={() => read(openIn === "window")}
              >
                <TbBook size={16} />
              </Action>
            ) : null}
            {book.here && canOpenBookWindow ? (
              <Action
                title={
                  openIn === "window"
                    ? t("Read in this window")
                    : t("Read in a new window")
                }
                onClick={() => read(openIn !== "window")}
              >
                <TbAppWindow size={16} />
              </Action>
            ) : null}
            <Action title={t("Edit metadata")} onClick={() => onMode("edit")}>
              <TbPencil size={16} />
            </Action>
            <Action
              title={t("Group and status")}
              onClick={() => onMode("mark")}
            >
              <TbBookmarks size={16} />
            </Action>
            {book.here ? (
              <Action
                title={t("Rename the file")}
                onClick={() => onMode("rename")}
              >
                <TbFilePencil size={16} />
              </Action>
            ) : null}
            {book.here && book.feed && book.feedUrl ? (
              <Action
                title={t("Add the new articles from the feed")}
                onClick={updateFromFeed}
                disabled={updating}
              >
                {updating ? <Spinner size="xs" /> : <TbRss size={16} />}
              </Action>
            ) : null}
            <Action
              title={
                book.synced
                  ? t("Stop syncing the book file")
                  : t("Sync the book file too")
              }
              onClick={async () => {
                if (!book.synced && !(await confirmBooksSync([book]))) return;
                await setBookSynced(ws, book.hash, !book.synced);
                onChanged();
              }}
            >
              {book.synced ? <TbCloud size={16} /> : <TbCloudOff size={16} />}
            </Action>
            <Action
              title={copied ? t("Copied") : t("Copy a link to the book")}
              onClick={() => {
                copy(`[${book.title}](${bookHref(book.hash)})`);
                setCopied(true);
              }}
            >
              <TbLink size={16} />
            </Action>
            {hasNotes ? (
              <Action
                title={t("Open the notes")}
                onClick={async () => {
                  onClose();
                  await openFilePath(notesPath, true);
                  dispatch({ view: "md", params: { noteId: notesPath } });
                }}
              >
                <TbNotes size={16} />
              </Action>
            ) : null}
            <Action title={t("Delete")} onClick={() => onMode("delete")} danger>
              <TbTrash size={16} />
            </Action>
          </div>
        </div>
      </div>
      {progress || updated ? (
        <p
          className={`mb-3 text-sm ${updated?.error ? "text-error" : updated ? "text-success" : ""}`}
          role="status"
        >
          {progress || updated?.text}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-sm font-semibold">{label}</dt>
            <dd className="text-sm break-words text-base-content/70 line-clamp-3">
              {value || t("Unknown")}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mb-2">
        <div className="text-sm font-semibold">{t("File")}</div>
        <div className="text-sm break-all text-base-content/70">
          {book.file}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold">{t("Description")}</div>
        <div
          className="text-sm text-base-content/70 max-h-48 overflow-y-auto [&_p]:my-1"
          dangerouslySetInnerHTML={{
            __html: book.description
              ? sanitizeHtml(book.description)
              : t("No description"),
          }}
        />
      </div>
    </>
  );
}

const FIELDS: {
  field: keyof Form;
  label: string;
  placeholder?: string;
  wide?: boolean;
  area?: boolean;
}[] = [
  { field: "title", label: "Title *", wide: true }, // i18n-ignore: t("Title") when shown
  { field: "subtitle", label: tk("Subtitle"), wide: true },
  {
    field: "author",
    label: tk("Author"),
    placeholder: tk("Jane Doe, John Roe"),
    wide: true,
  },
  { field: "series", label: tk("Series") },
  { field: "seriesIndex", label: tk("Series index"), placeholder: "1" },
  { field: "seriesTotal", label: tk("Total in series") },
  { field: "publisher", label: tk("Publisher") },
  {
    field: "published",
    label: tk("Publication date"),
    placeholder: tk("YYYY or YYYY-MM-DD"),
  },
  { field: "language", label: tk("Language"), placeholder: "en, zh, fr" }, // i18n-ignore: codes
  {
    field: "identifier",
    label: tk("Identifier"),
    placeholder: "978-0123456789",
    wide: true,
  },
  {
    field: "subjects",
    label: tk("Subjects"),
    placeholder: tk("Fiction, Science, History"),
    wide: true,
  },
  { field: "description", label: tk("Description"), wide: true, area: true },
];

/** The cover as edited: as it is, an image chosen, the one of the book, none. */
type CoverEdit =
  | { kind: "keep" }
  | { kind: "image"; path: string; url: string }
  | { kind: "book" }
  | { kind: "none" };

function EditMeta({
  ws,
  book,
  cover,
  onCancel,
  onSaved,
}: {
  ws: string;
  book: ShelfBook;
  cover?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [form, setForm] = useState<Form>(() => formOf(book));
  const [coverEdit, setCoverEdit] = useState<CoverEdit>({ kind: "keep" });
  const [bookCover, setBookCover] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const errors = useMemo(() => validateMeta(form), [form]);

  // the cover of the book itself, to restore it
  useEffect(() => {
    if (coverEdit.kind !== "book") return;
    let url: string | undefined;
    void coverUrl(ws, book.hash).then((u) => {
      url = u;
      setBookCover(u);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [coverEdit.kind, ws, book.hash]);
  useEffect(
    () => () => {
      if (coverEdit.kind === "image") URL.revokeObjectURL(coverEdit.url);
    },
    [coverEdit],
  );

  const shownCover =
    coverEdit.kind === "keep"
      ? cover
      : coverEdit.kind === "image"
        ? coverEdit.url
        : coverEdit.kind === "book"
          ? bookCover
          : undefined;

  const chooseImage = async () => {
    const picked = await openFileDilog(COVER_EXTS, false);
    const path = typeof picked === "string" ? picked : picked?.[0];
    if (!path) return;
    const data = await invoke<ArrayBuffer | number[]>("read_file_bytes", {
      filePath: path,
    });
    const bytes = data instanceof ArrayBuffer ? data : new Uint8Array(data);
    setCoverEdit({
      kind: "image",
      path,
      url: URL.createObjectURL(new Blob([bytes])),
    });
  };

  const save = async () => {
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError("");
    try {
      let coverField: BookEntry["cover"] = book.cover;
      if (coverEdit.kind === "image") {
        if (!(await setCustomCover(ws, book.hash, coverEdit.path)))
          throw new Error("The image could not be read");
        coverField = "custom";
      } else if (coverEdit.kind === "book") {
        coverField = undefined;
      } else if (coverEdit.kind === "none") {
        coverField = "none";
      }
      await saveBookEntry(ws, {
        hash: book.hash,
        ...metaOfForm(form),
        edited: true,
        cover: coverField,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex gap-4 mb-4">
        <div className="flex flex-col w-28 gap-1 shrink-0">
          <button
            type="button"
            className="aspect-28/41"
            onClick={chooseImage}
            title={t("Choose an image")}
          >
            <BookCover
              book={{ title: form.title, author: form.author }}
              url={shownCover}
            />
          </button>
          <div className="flex justify-between">
            <Action title={t("Choose an image")} onClick={chooseImage}>
              <TbPhoto size={16} />
            </Action>
            <Action
              title={t("The cover of the book")}
              onClick={() => setCoverEdit({ kind: "book" })}
            >
              <TbRestore size={16} />
            </Action>
            <Action
              title={t("No cover")}
              onClick={() => setCoverEdit({ kind: "none" })}
              danger
            >
              <TbPhotoOff size={16} />
            </Action>
          </div>
        </div>
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          {FIELDS.slice(0, 3).map((f) => (
            <Field
              key={f.field}
              {...f}
              form={form}
              setForm={setForm}
              error={errors[f.field]}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FIELDS.slice(3).map((f) => (
          <Field
            key={f.field}
            {...f}
            form={form}
            setForm={setForm}
            error={errors[f.field]}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-base-content/60">
        {t(
          "Once saved, the metadata is not taken from the book file any more.",
        )}
      </p>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onCancel}
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setForm(formOf(book));
            setCoverEdit({ kind: "keep" });
          }}
        >
          {t("Reset")}
        </button>
        <button
          type="submit"
          className="btn btn-sm btn-primary"
          disabled={saving || Object.keys(errors).length > 0}
        >
          {t("Save")}
        </button>
      </div>
    </form>
  );
}

function Field({
  field,
  label,
  placeholder,
  wide,
  area,
  form,
  setForm,
  error,
}: (typeof FIELDS)[number] & {
  form: Form;
  setForm: (fn: (form: Form) => Form) => void;
  error?: string;
}) {
  const props = {
    value: form[field],
    placeholder: placeholder && t(placeholder),
    "aria-label": t(label.replace(" *", "")),
    "aria-invalid": error ? true : undefined,
    onChange: (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [field]: e.target.value })),
  };
  return (
    <label
      className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}
    >
      <span className="font-medium">
        {label.endsWith(" *") ? `${t(label.replace(" *", ""))} *` : t(label)}
      </span>
      {area ? (
        <textarea
          className={`textarea textarea-sm w-full ${error ? "textarea-error" : ""}`}
          rows={4}
          {...props}
        />
      ) : (
        <input
          className={`input input-sm w-full ${error ? "input-error" : ""}`}
          {...props}
        />
      )}
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </label>
  );
}

function MarkBook({
  ws,
  book,
  books,
  onCancel,
  onSaved,
}: {
  ws: string;
  book: ShelfBook;
  books: ShelfBook[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [group, setGroup] = useState(book.group ?? "");
  const [status, setStatus] = useState(book.status ?? "");
  const groups = useMemo(() => allGroups(books), [books]);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await saveBookEntry(ws, {
          hash: book.hash,
          group: normalizeGroup(group) || undefined,
          status: status.trim() || undefined,
        });
        onSaved();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("Group")}</span>
        <input
          className="input input-sm w-full"
          list="library-groups"
          value={group}
          aria-label={t("Group")}
          placeholder={t("e.g. Fiction/Classics, empty for none")}
          onChange={(e) => setGroup(e.target.value)}
        />
        <datalist id="library-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("Status")}</span>
        <input
          className="input input-sm w-full"
          list="library-statuses"
          value={status}
          aria-label={t("Status")}
          placeholder={t("Todo, Doing, Done, ...")}
          onChange={(e) => setStatus(e.target.value)}
        />
        <datalist id="library-statuses">
          {STATUSES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onCancel}
        >
          {t("Cancel")}
        </button>
        <button type="submit" className="btn btn-sm btn-primary">
          {t("Save")}
        </button>
      </div>
    </form>
  );
}

/**
 * The book file renamed, its notes (`Foo.epub.md`) with it; its library
 * entry, its links, its reading progress stay the book's.
 */
function RenameBook({
  book,
  onCancel,
  onRenamed,
}: {
  book: ShelfBook;
  onCancel: () => void;
  onRenamed: () => void;
}) {
  const t = useT();
  const slash = book.path.lastIndexOf("/");
  const fileName = book.path.slice(slash + 1);
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot) : "";
  const [name, setName] = useState(dot > 0 ? fileName.slice(0, dot) : fileName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    setBusy(true);
    const err = await renamePath(book.path, name, {
      ...bookRenameOptions(book.path),
      ext,
    });
    setBusy(false);
    if (err) setError(err);
    else onRenamed();
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void rename();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{t("File name")}</span>
        <div className="join w-full">
          <input
            className="input input-sm join-item w-full"
            value={name}
            autoFocus
            aria-label={t("File name")}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
          {ext ? (
            <span className="join-item btn btn-sm btn-disabled no-animation">
              {ext}
            </span>
          ) : null}
        </div>
      </label>
      <p className="text-sm text-base-content/70">
        {t(
          "Its notes ({file}) are renamed with it. The title, reading progress, highlights and links to the book stay as they are.",
          { file: `${fileName}.md` },
        )}
      </p>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onCancel}
        >
          {t("Cancel")}
        </button>
        <button
          type="submit"
          className="btn btn-sm btn-primary"
          disabled={busy}
        >
          {t("Rename")}
        </button>
      </div>
    </form>
  );
}

function DeleteBook({
  ws,
  book,
  onCancel,
  onDeleted,
}: {
  ws: string;
  book: ShelfBook;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const [withNotes, setWithNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p>
        {book.synced
          ? tr(
              "Delete {title}: the book file, its reading progress and covers, from the workspace (and from the other devices once synced)?",
              { title: <b>{book.title}</b> },
            )
          : tr(
              "Delete {title}: the book file, its reading progress and covers, from the workspace?",
              { title: <b>{book.title}</b> },
            )}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={withNotes}
          onChange={(e) => setWithNotes(e.target.checked)}
        />
        {t("Delete its notes too ({file})", {
          file: annotationsPathOf(book.file).split("/").pop() ?? "",
        })}
      </label>
      <div className="flex justify-end gap-2">
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button
          className="btn btn-sm btn-error"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await deleteBook(ws, book.hash, withNotes);
            await deleteCovers(ws, book.hash);
            onDeleted();
          }}
        >
          {t("Delete")}
        </button>
      </div>
    </div>
  );
}

function Action({
  title,
  onClick,
  danger = false,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <IconButton
      className={danger ? "text-error" : ""}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </IconButton>
  );
}

const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 ** 2).toFixed(1)} MB`;

const formatDate = (iso?: string) => {
  const t = iso ? new Date(iso) : undefined;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString() : undefined;
};
