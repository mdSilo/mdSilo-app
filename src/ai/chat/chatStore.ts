import { create } from "zustand";
import { store } from "@/state/store";
import type { ViewState } from "@/state/viewReducer";
import { fromWorkspacePath, toWorkspacePath } from "@/workspace/util";
import { noteContent } from "@/lib/contentCache";
import { oneLine } from "@/issue/issueOfText";
import { writeNote } from "@/plugins/workspaceApi";
import { chat, resolve } from "../client";
import { stopMessage } from "../protocol";
import { contextOf, type Scope } from "./context";
import { chatFileName, chatMarkdown, CHATS_DIR, parseChat } from "./chatFile";
import {
  messagesOf,
  POLISH_PROMPT,
  type Attached,
  type ChatMsg,
} from "./prompt";

/**
 * The chat beside the view (docs/ai.md): one at a time, kept as a note in
 * `chats/` once answered, unless the folder is none.
 */

type Queued = { prompt: string; polish?: boolean };

type ChatState = {
  messages: ChatMsg[];
  /** what the chat may read */
  scope: Scope;
  /** the text selected, sent with the next message */
  attached?: Attached;
  busy: boolean;
  controller?: AbortController;
  title: string;
  created: string;
  /** the note the chat is kept in, by id */
  noteId?: string;
  /** why the chat could not be kept */
  saveError?: string;
  /** a message to send once the pane has the view: asked from elsewhere */
  queued?: Queued;
  /** the text selected in a note to polish, answered by `resolvePolish` */
  polish?: { msgId?: string; resolve: (text?: string) => void };
};

const fresh = () => ({
  messages: [] as ChatMsg[],
  attached: undefined,
  busy: false,
  controller: undefined,
  title: "",
  created: new Date().toISOString(),
  noteId: undefined,
  saveError: undefined,
  queued: undefined,
});

export const useChat = create<ChatState>(() => ({
  ...fresh(),
  scope: "auto",
}));

let lastId = 0;
const newId = () => `m${Date.now().toString(36)}${++lastId}`;

const update = (id: string, changes: Partial<ChatMsg>) =>
  useChat.setState((s) => ({
    messages: s.messages.map((m) => (m.id === id ? { ...m, ...changes } : m)),
  }));

/** Open the chat; with the text selected, to ask about; with a prompt, asked at once. */
export function askAi(prompt?: string, attached?: Attached) {
  store.getState().setIsChatOpen(true);
  useChat.setState({
    ...(attached ? { attached } : {}),
    ...(prompt ? { queued: { prompt } } : {}),
  });
}

/**
 * The text selected in a note polished in the chat; the new text once the
 * user takes it, none if not.
 */
export function polishInChat(attached: Attached): Promise<string | undefined> {
  useChat.getState().polish?.resolve(undefined);
  return new Promise((resolvePromise) => {
    store.getState().setIsChatOpen(true);
    useChat.setState({
      attached,
      queued: { prompt: POLISH_PROMPT, polish: true },
      polish: { resolve: resolvePromise },
    });
  });
}

/** The polished text taken (to replace the text selected), or not. */
export function resolvePolish(text?: string) {
  const polish = useChat.getState().polish;
  useChat.setState({ polish: undefined });
  polish?.resolve(text?.trim() || undefined);
}

export function stopChat() {
  useChat.getState().controller?.abort();
}

export function newChat() {
  stopChat();
  resolvePolish(undefined);
  useChat.setState(fresh());
}

/** Go on with a chat kept in a note. */
export async function openChatNote(noteId: string) {
  newChat();
  const { meta, messages } = parseChat(await noteContent(noteId));
  useChat.setState({
    messages,
    noteId,
    title: meta.title ?? "",
    created: meta.created ?? new Date().toISOString(),
  });
  store.getState().setIsChatOpen(true);
}

/** Keep the chat in its note, made at the first answer. */
async function save() {
  const { messages, title, created, noteId } = useChat.getState();
  const ws = store.getState().initDir;
  if (!ws || messages.length === 0) return;
  const model = [...messages].reverse().find((m) => m.model)?.model;
  const text = chatMarkdown({ title, created, model }, messages);
  try {
    if (noteId && store.getState().notes.has(noteId)) {
      await writeNote({ path: toWorkspacePath(ws, noteId), text });
      return;
    }
    const name = chatFileName(title, new Date(created));
    for (let i = 1; i < 100; i++) {
      const rel = `${CHATS_DIR}/${name}${i > 1 ? ` ${i}` : ""}.md`;
      const id = fromWorkspacePath(ws, rel);
      if (store.getState().notes.has(id)) continue;
      try {
        await writeNote({ path: rel, text, create: true });
        useChat.setState({ noteId: id, saveError: undefined });
        return;
      } catch (e) {
        // there already, unknown to the app: the next name
        if (!/Not a note/.test(String(e))) throw e;
      }
    }
  } catch (e) {
    useChat.setState({ saveError: e instanceof Error ? e.message : String(e) });
  }
}

/** Send a message: the answer streamed in, the chat kept once answered. */
export async function sendMessage(
  text: string,
  view: ViewState | undefined,
  options: { polish?: boolean } = {},
) {
  const state = useChat.getState();
  if (state.busy || !text.trim()) return;
  const controller = new AbortController();
  const user: ChatMsg = {
    id: newId(),
    role: "user",
    text: text.trim(),
    ...(state.attached ? { attached: state.attached } : {}),
  };
  const answer: ChatMsg = {
    id: newId(),
    role: "assistant",
    text: "",
    streaming: true,
  };
  const history = [...state.messages, user];
  useChat.setState({
    messages: [...history, answer],
    attached: undefined,
    busy: true,
    controller,
    title: state.title || oneLine(user.text, 60),
    queued: undefined,
    ...(options.polish && state.polish
      ? { polish: { ...state.polish, msgId: answer.id } }
      : {}),
  });
  let written = "";
  try {
    // polishing reads the text selected only
    const context = options.polish
      ? null
      : await contextOf(state.scope, view).catch(() => null);
    const { provider, model } = await resolve({});
    update(answer.id, {
      model,
      ...(context?.chunks.length
        ? { sources: context.chunks, scopeLabel: context.label }
        : {}),
    });
    for await (const delta of chat({
      provider,
      model,
      messages: messagesOf(history, context),
      signal: controller.signal,
    })) {
      if (delta.type === "text") {
        written += delta.text;
        update(answer.id, { text: written });
      } else if (delta.type === "error")
        update(answer.id, { error: delta.message });
      else if (delta.type === "stop") {
        const said = stopMessage(delta.reason);
        if (said) update(answer.id, { error: said });
      }
    }
  } catch (e) {
    if (!controller.signal.aborted)
      update(answer.id, { error: e instanceof Error ? e.message : String(e) });
  } finally {
    update(answer.id, { streaming: false });
    useChat.setState({ busy: false, controller: undefined });
    // nothing to polish with: none taken
    const polish = useChat.getState().polish;
    if (polish?.msgId === answer.id && !written.trim())
      resolvePolish(undefined);
    if (written.trim()) await save();
  }
}

/** Ask again for the last answer. */
export async function retryLast(view: ViewState | undefined) {
  const { messages, busy } = useChat.getState();
  if (busy) return;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return;
  const i = messages.lastIndexOf(lastUser);
  useChat.setState({
    messages: messages.slice(0, i),
    attached: lastUser.attached,
  });
  await sendMessage(lastUser.text, view);
}
