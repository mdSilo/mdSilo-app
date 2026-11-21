import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import copy from "copy-to-clipboard";
import {
  TbArrowBackUp,
  TbCircleDot,
  TbCopy,
  TbFileText,
  TbPlayerStopFilled,
  TbPlus,
  TbRowInsertBottom,
  TbSend,
  TbWorld,
  TbX,
} from "react-icons/tb";
import { store, useStore } from "@/state/store";
import { CHAT_WIDTH } from "@/state/userSettings";
import { useCurrentViewContext } from "@/state/useCurrentView";
import useIsMobile from "@/lib/hooks/useIsMobile";
import useLinkHandlers from "@/writer/hooks/useLinkHandlers";
import { editorOf } from "@/writer/editors";
import { issueStore } from "@/issue/issueStore";
import { oneLine } from "@/issue/issueOfText";
import { openInApp } from "@/plugins/workspaceApi";
import { targetLanguage } from "@/reader/lookup/lookup";
import { toWorkspacePath } from "@/workspace/util";
import { encodeHref } from "@/lib/mdlink";
import { openUrl } from "@/workspace/open";
import ResizeHandle, { useResizableWidth } from "@/ui/ResizeHandle";
import { useT } from "@/i18n";
import { useAiProviders } from "../providers";
import { languageName } from "../translate";
import { makeWeeklyReview } from "../review";
import { useProfileModal } from "../ProfileModal";
import { folderOf, scopesFor, viewKindOf, type Scope } from "./context";
import SentPreview from "./SentPreview";
import { CHATS_DIR, linkCitations } from "./chatFile";
import {
  NO_WEB_VIEWS,
  QUICK_PROMPTS,
  relatedPrompt,
  tagsPrompt,
  type ChatMsg,
} from "./prompt";
import { usedTags } from "./tools";
import { fillPrompt, usePrompts } from "./prompts";
import { clipPage } from "./web";
import { answerHtml, CITE_CLASS } from "./render";
import {
  saveChat,
  newChat,
  openChatNote,
  resolvePolish,
  retryLast,
  sendMessage,
  stopChat,
  useChat,
} from "./chatStore";

/** The chat with the AI beside the view (docs/ai.md, "The chatbox"). */
export default function ChatPane() {
  const t = useT();
  const mobile = useIsMobile();
  const { state: view, dispatch } = useCurrentViewContext();
  const setIsChatOpen = useStore((s) => s.setIsChatOpen);
  const chatWidth = useStore((s) => s.chatWidth);
  const setChatWidth = useStore((s) => s.setChatWidth);
  const ws = useStore((s) => s.initDir);
  const { width, onResize, onResizeEnd } = useResizableWidth(
    chatWidth,
    setChatWidth,
    CHAT_WIDTH,
  );
  const messages = useChat((s) => s.messages);
  const scope = useChat((s) => s.scope);
  const attached = useChat((s) => s.attached);
  const busy = useChat((s) => s.busy);
  const queued = useChat((s) => s.queued);
  const noteId = useChat((s) => s.noteId);
  const saveError = useChat((s) => s.saveError);
  const polish = useChat((s) => s.polish);
  const providers = useAiProviders((s) => s.providers);
  const searchServices = useAiProviders((s) => s.searchServices);
  const web = useChat((s) => s.web);
  const presets = usePrompts((s) => s.presets);
  const chatProvider = useStore((s) => s.aiSettings.chatProvider);
  // the web: Anthropic's own search, else a search service set up
  const provider = providers.find((p) => p.id === chatProvider) ?? providers[0];
  const canWeb =
    provider?.kind === "anthropic" ||
    (searchServices.length > 0 && provider?.settings.tools !== false);
  const loaded = useAiProviders((s) => s.loaded);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const { onOpenLink } = useLinkHandlers();

  useEffect(() => {
    if (!loaded)
      void useAiProviders
        .getState()
        .load()
        .catch(() => undefined);
  }, [loaded]);
  // asked from elsewhere (a text selected): sent with the view of here
  useEffect(() => {
    if (queued && !busy)
      void sendMessage(queued.prompt, view, { polish: queued.polish });
  }, [queued, busy, view]);
  // the newest at the bottom, in sight
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const viewNote = view.view === "md" ? view.params?.noteId : undefined;
  const kind = viewKindOf(view);
  const scopes = scopesFor(view);
  // a scope the view no longer allows (the book closed…): what the view shows
  useEffect(() => {
    if (!scopes.includes(scope)) useChat.setState({ scope: "auto" });
  }, [scopes, scope]);
  const scopeLabels: Record<Scope, string> = {
    auto: {
      note: t("This note"),
      book: t("This chapter"),
      feed: t("This article"),
      none: t("Nothing open to read"),
    }[kind],
    book: t("The whole book"),
    folder: t("This folder"),
    all: t("All my notes"),
    none: t("Nothing"),
  };
  // a chat note open in the view: to go on with
  const chatNoteOpen =
    ws &&
    viewNote &&
    viewNote !== noteId &&
    toWorkspacePath(ws, viewNote).startsWith(`${CHATS_DIR}/`);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void sendMessage(text, view);
  };
  useEffect(() => {
    if (ws) void usePrompts.getState().load();
  }, [ws]);
  const ask = (prompt: string) => void sendMessage(prompt, view);
  // other views want the web, for where they come from; else said to be the model's own
  // the notes like the one open, by the tools through all the notes
  const askRelated = () => {
    const title = viewNote ? store.getState().notes.get(viewNote)?.title : "";
    void sendMessage(relatedPrompt(title ?? ""), view, { scope: "all" });
  };
  const askTags = () => void sendMessage(tagsPrompt(usedTags()), view);
  const [made, setMade] = useState("");
  const review = async () => {
    setMade(t("Reading your week…"));
    try {
      const id = await makeWeeklyReview();
      if (!id || !ws) {
        setMade(t("No notes changed this week"));
        return;
      }
      setMade("");
      await openInApp({ note: toWorkspacePath(ws, id) }, dispatch);
    } catch (e) {
      setMade(e instanceof Error ? e.message : String(e));
    }
  };
  const askViews = () =>
    void sendMessage(
      canWeb ? QUICK_PROMPTS.views : `${QUICK_PROMPTS.views} ${NO_WEB_VIEWS}`,
      view,
      canWeb ? { web: true } : {},
    );
  const lang = () =>
    targetLanguage(store.getState().readerSettings.translateTo);
  const askPreset = (template: string) => {
    const { prompt, inPrompt } = fillPrompt(template, {
      attached: useChat.getState().attached,
      lang: lang(),
    });
    if (inPrompt) useChat.setState({ attached: undefined });
    ask(prompt);
  };
  const translatePrompt = () =>
    `Translate this passage into ${languageName(
      targetLanguage(store.getState().readerSettings.translateTo),
    )}.`;

  /** a citation or a link of an answer: opened in the app */
  const onClick = (e: MouseEvent<HTMLDivElement>, msg: ChatMsg) => {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    e.preventDefault();
    const cite = link.classList.contains(CITE_CLASS)
      ? msg.sources?.[Number(link.dataset.cite) - 1]?.href
      : link.getAttribute("href");
    if (cite) void onOpenLink(cite);
  };

  return (
    <div
      className={
        mobile
          ? "absolute inset-0 z-30 flex flex-col bg-base-100"
          : "relative flex flex-col flex-none h-full border-l border-base-300 bg-base-100"
      }
      style={mobile ? undefined : { width }}
      data-testid="chat-pane"
    >
      {mobile ? null : (
        <ResizeHandle
          width={width}
          bounds={CHAT_WIDTH}
          label={t("Resize the chat")}
          edge="left"
          onResize={onResize}
          onResizeEnd={onResizeEnd}
        />
      )}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-base-300 bg-base-200">
        <span className="font-semibold">{t("AI")}</span>
        <select
          className="select select-ghost select-xs max-w-44"
          aria-label={t("What the chat may read")}
          title={t("What the chat may read")}
          value={scopes.includes(scope) ? scope : "auto"}
          onChange={(e) => {
            const next = e.target.value as Scope;
            useChat.setState({
              scope: next,
              ...(next === "folder" && viewNote
                ? { folder: folderOf(viewNote) }
                : {}),
            });
          }}
        >
          {scopes.map((s) => (
            <option key={s} value={s}>
              {scopeLabels[s]}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button
          type="button"
          className={`btn btn-xs btn-square ${web && canWeb ? "btn-primary" : "btn-ghost"}`}
          title={
            canWeb
              ? web
                ? t("The chat may search the web: click to stop")
                : t("Let the chat search the web")
              : t(
                  "To search the web: Anthropic, or a search service in Settings > AI",
                )
          }
          aria-pressed={web && canWeb}
          disabled={!canWeb}
          onClick={() => useChat.setState({ web: !web })}
        >
          <TbWorld size={16} />
        </button>
        {noteId && ws ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            title={t("Open the note of the chat")}
            onClick={() =>
              void openInApp({ note: toWorkspacePath(ws, noteId) }, dispatch)
            }
          >
            <TbFileText size={16} />
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title={t("New chat")}
          onClick={newChat}
        >
          <TbPlus size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title={t("Close (Ctrl/⌘+J)")}
          onClick={() => setIsChatOpen(false)}
        >
          <TbX size={16} />
        </button>
      </div>

      <div
        ref={listRef}
        className="flex flex-col flex-1 gap-3 p-2 overflow-y-auto text-sm"
      >
        {loaded && providers.length === 0 ? (
          <div className="p-3 text-center">
            <p className="mb-2">{t("No AI provider is set up yet.")}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => store.getState().setIsAiSettingsOpen(true)}
            >
              {t("Set up AI")}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="p-3 text-center text-base-content/70">
            {t(
              "Ask about what is open: the note, the chapter of the book, the article. Answers cite the passages they use.",
            )}
          </p>
        ) : null}
        {messages.length === 0 && providers.length > 0 && ws ? (
          <div className="flex flex-wrap items-center justify-center gap-1">
            <QuickButton
              label={t("Weekly review")}
              onClick={() => void review()}
            />
            <QuickButton
              label={t("My profile")}
              onClick={() => useProfileModal.setState({ open: true })}
            />
            {made ? (
              <span className="text-xs text-base-content/60">{made}</span>
            ) : null}
          </div>
        ) : null}
        {chatNoteOpen ? (
          <button
            type="button"
            className="self-center btn btn-xs"
            onClick={() => void openChatNote(viewNote)}
          >
            {t("Go on with this chat")}
          </button>
        ) : null}
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div
              key={msg.id}
              className="self-end max-w-[90%] px-3 py-2 rounded-lg bg-base-200 whitespace-pre-wrap break-words"
            >
              {msg.attached?.text ? (
                <blockquote className="pl-2 mb-1 text-xs border-l-2 border-base-300 text-base-content/70 line-clamp-4">
                  {msg.attached.text}
                </blockquote>
              ) : null}
              {msg.text}
            </div>
          ) : (
            <Answer
              key={msg.id}
              msg={msg}
              last={i === messages.length - 1}
              polishing={polish?.msgId === msg.id}
              onClick={(e) => onClick(e, msg)}
              onRetry={() => void retryLast(view)}
              chatNoteId={noteId}
            />
          ),
        )}
        {saveError ? (
          <p className="text-xs text-error">
            {t("The chat could not be kept: {error}", { error: saveError })}
          </p>
        ) : null}
      </div>

      <div className="p-2 border-t border-base-300">
        {attached ? (
          <div className="flex items-start gap-1 p-1 mb-1 text-xs rounded bg-base-200">
            <blockquote className="flex-1 pl-2 border-l-2 border-base-300 line-clamp-3 text-base-content/70">
              {attached.text}
            </blockquote>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square"
              title={t("Remove")}
              onClick={() => useChat.setState({ attached: undefined })}
            >
              <TbX size={12} />
            </button>
          </div>
        ) : null}
        {kind === "note" && !attached && !busy && providers.length > 0 ? (
          <div className="flex flex-wrap gap-1 mb-1">
            {ws ? (
              <QuickButton label={t("Related notes")} onClick={askRelated} />
            ) : null}
            <QuickButton label={t("Suggest tags")} onClick={askTags} />
          </div>
        ) : null}
        {attached && !busy ? (
          <div className="flex flex-wrap gap-1 mb-1">
            <QuickButton
              label={t("Explain")}
              onClick={() => ask(QUICK_PROMPTS.explain)}
            />
            <QuickButton
              label={t("Summarize")}
              onClick={() => ask(QUICK_PROMPTS.summarize)}
            />
            <QuickButton
              label={t("Translate")}
              onClick={() => ask(translatePrompt())}
            />
            <QuickButton label={t("Other views")} onClick={askViews} />
          </div>
        ) : null}
        {presets.length > 0 && !busy ? (
          <div className="flex flex-wrap gap-1 mb-1" data-testid="chat-presets">
            {presets.map((p) => (
              <QuickButton
                key={p.id}
                label={p.name}
                onClick={() => askPreset(p.prompt)}
              />
            ))}
          </div>
        ) : null}
        <SentPreview view={view} />
        <div className="flex items-end gap-1">
          <textarea
            className="flex-1 textarea textarea-sm min-h-10 max-h-40"
            rows={2}
            value={draft}
            placeholder={t("Ask… (Enter to send, Shift+Enter for a new line)")}
            aria-label={t("Message")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="btn btn-sm btn-square"
              title={t("Stop")}
              onClick={stopChat}
            >
              <TbPlayerStopFilled size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm btn-square"
              title={t("Send")}
              disabled={!draft.trim()}
              onClick={send}
            >
              <TbSend size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="btn btn-xs" onClick={onClick}>
      {label}
    </button>
  );
}

/** The note the answer can go in: the note shown, else the note beside. */
function targetNote(): string | undefined {
  const { currentNoteId, besideNoteId } = store.getState();
  for (const id of [currentNoteId, besideNoteId])
    if (id && editorOf(id)) return id;
  return undefined;
}

function Answer({
  msg,
  last,
  polishing,
  onClick,
  onRetry,
  chatNoteId,
}: {
  msg: ChatMsg;
  last: boolean;
  polishing: boolean;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
  onRetry: () => void;
  chatNoteId?: string;
}) {
  const t = useT();
  const [done, setDone] = useState("");
  const html = useMemo(
    () => (msg.text ? answerHtml(msg.text, msg.sources) : ""),
    [msg.text, msg.sources],
  );
  // the answer with its citations as links, to put in a note
  const markdown = () => linkCitations(msg.text.trim(), msg.sources);
  const insert = () => {
    const id = targetNote();
    const put = id ? editorOf(id)?.insertMarkdown(markdown()) : false;
    if (!put) copy(markdown(), { format: "text/plain" });
    setDone(
      put ? t("Put in the note") : t("Copied: no note open to put it in"),
    );
  };
  const makeIssue = async () => {
    const ws = store.getState().initDir;
    if (!ws) return;
    await issueStore.getState().load(ws);
    const num = issueStore.getState().createIssue({
      title: oneLine(msg.text),
      body: markdown(),
      notes: chatNoteId ? [chatNoteId] : [],
    });
    setDone(t("Issue #{num} made", { num }));
  };

  return (
    <div className="flex flex-col gap-1" data-testid="chat-answer">
      {msg.scopeLabel ? (
        <span className="text-xs text-base-content/60">
          {t("Read: {label}", { label: msg.scopeLabel })}
        </span>
      ) : null}
      {msg.steps?.length ? (
        <ul className="text-xs text-base-content/60" data-testid="chat-steps">
          {msg.steps.map((step, i) => (
            <li key={i}>↳ {step}</li>
          ))}
        </ul>
      ) : null}
      {html ? (
        <div
          className="ai-answer prose prose-sm max-w-none break-words"
          onClick={onClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
      {msg.streaming && !msg.text ? (
        <span className="loading loading-dots loading-sm" />
      ) : null}
      {msg.error ? <p className="text-xs text-error">{msg.error}</p> : null}
      {!msg.streaming ? <WebSources msg={msg} /> : null}
      {!msg.streaming && msg.text ? (
        <div className="flex flex-wrap items-center gap-1 text-base-content/70">
          {polishing ? (
            <>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => resolvePolish(msg.text)}
              >
                {t("Replace the selection")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => resolvePolish(undefined)}
              >
                {t("Discard")}
              </button>
            </>
          ) : null}
          <IconAction
            title={t("Copy")}
            onClick={() => {
              copy(markdown(), { format: "text/plain" });
              setDone(t("Copied"));
            }}
          >
            <TbCopy size={14} />
          </IconAction>
          <IconAction title={t("Put in the note")} onClick={insert}>
            <TbRowInsertBottom size={14} />
          </IconAction>
          {store.getState().initDir ? (
            <IconAction
              title={t("New issue of it")}
              onClick={() => void makeIssue()}
            >
              <TbCircleDot size={14} />
            </IconAction>
          ) : null}
          {last ? (
            <IconAction title={t("Ask again")} onClick={onRetry}>
              <TbArrowBackUp size={14} />
            </IconAction>
          ) : null}
          {done ? <span className="text-xs">{done}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function IconAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs btn-square"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** The pages of the web an answer cites, each to keep as a clip. */
function WebSources({ msg }: { msg: ChatMsg }) {
  const t = useT();
  const [saving, setSaving] = useState("");
  const pages = (msg.sources ?? [])
    .map((s, i) => ({ ...s, n: i + 1 }))
    .filter((s) => /^https?:\/\//i.test(s.href))
    .filter((s, i, all) => all.findIndex((o) => o.href === s.href) === i);
  if (pages.length === 0) return null;
  const save = async (url: string, title?: string, excerpt?: string) => {
    setSaving(url);
    try {
      const clip = await clipPage(url, title, excerpt);
      if (!clip) return;
      // the citations of the page link to the clip from now on
      useChat.setState((s) => ({
        messages: s.messages.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                sources: m.sources?.map((c) =>
                  c.href === url ? { ...c, href: encodeHref(clip) } : c,
                ),
              }
            : m,
        ),
      }));
      await saveChat();
    } finally {
      setSaving("");
    }
  };
  return (
    <ul className="text-xs text-base-content/70" data-testid="web-sources">
      {pages.map((p) => (
        <li key={p.href} className="flex items-center gap-1">
          <span className="shrink-0">[{p.n}]</span>
          <a
            href={p.href}
            className="truncate link link-hover"
            onClick={(e) => {
              e.preventDefault();
              void openUrl(p.href);
            }}
          >
            {p.title || p.href}
          </a>
          {store.getState().initDir ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs shrink-0"
              disabled={Boolean(saving)}
              onClick={() => void save(p.href, p.title, p.text)}
            >
              {saving === p.href ? t("Saving…") : t("Save as clip")}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
