import { create } from "zustand";
import { store } from "@/state/store";
import type { ViewState } from "@/state/viewReducer";
import { fromWorkspacePath, toWorkspacePath } from "@/workspace/util";
import { noteContent } from "@/lib/contentCache";
import { oneLine } from "@/issue/issueOfText";
import { writeNote } from "@/plugins/workspaceApi";
import { chat, resolve } from "../client";
import { stopMessage, type ChatMessage, type ToolCall } from "../protocol";
import { canUseTools, searchService } from "../providers";
import {
  contextOf,
  toolScopeOf,
  type Chunk,
  type Context,
  type Scope,
} from "./context";
import { runTool, searchFor, toolsFor } from "./tools";
import {
  anthropicWebTools,
  isWebTool,
  runWebTool,
  webOf,
  WEB_TOOLS,
} from "./web";
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
  /** the folder of the scope `folder`, by its path */
  folder?: string;
  /** the chat may search the web */
  web: boolean;
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
  web: false,
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
export const saveChat = () => save();

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

/** rounds of calls of tools at most, for an answer */
export const MAX_ROUNDS = 6;

const NO_MORE_TOOLS =
  "\n\n(That was the last look-up: answer now with what you have.)";

/** A provider refusing tools: an error of the request that says so. */
const refusesTools = (e: unknown) =>
  /\b400\b/.test(String(e)) && /tool|function/i.test(String(e));

/** A model refusing the newer tools of the web of Anthropic: the error says which. */
const refusesWebTools = (e: unknown) =>
  /\b400\b/.test(String(e)) && /web_(search|fetch)/i.test(String(e));

/** Send a message: the answer streamed in, the tools it calls run, the chat kept once answered. */
export async function sendMessage(
  text: string,
  view: ViewState | undefined,
  options: { polish?: boolean; web?: boolean } = {},
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
    const { provider, model } = await resolve({});
    // polishing reads the text selected only
    const scope = options.polish ? "none" : state.scope;
    let context: Context | null = await contextOf(scope, view).catch(
      () => null,
    );
    const toolScope = toolScopeOf(scope, state.folder);
    let withTools = Boolean(toolScope) && canUseTools(provider);
    // the web: Anthropic's own tools, else a search service, with tools
    const service = await searchService();
    const wantWeb = !options.polish && (options.web ?? state.web);
    const web = wantWeb ? webOf(provider, service) : undefined;
    let withWeb =
      web === "anthropic" || (web === "service" && canUseTools(provider));
    let basicWeb = false;
    const toolsNow = () => [
      ...(withTools && toolScope ? toolsFor(toolScope) : []),
      ...(withWeb
        ? web === "anthropic"
          ? anthropicWebTools(basicWeb)
          : WEB_TOOLS
        : []),
    ];
    // no tools: the passages of a search with the question, given at first
    const searchAtFirst = async () => {
      if (!toolScope) return;
      const found = await searchFor(user.text, toolScope);
      context = {
        label:
          context?.label ??
          (toolScope.kind === "book" ? "the book" : toolScope.label),
        chunks: [...(context?.chunks ?? []), ...found],
        partial: true,
      };
    };
    if (toolScope && !withTools) await searchAtFirst();
    const sources: Chunk[] = [...(context?.chunks ?? [])];
    const steps: string[] = [];
    update(answer.id, {
      model,
      ...(context?.label ? { scopeLabel: context.label } : {}),
      ...(sources.length ? { sources: [...sources] } : {}),
    });
    let messages: ChatMessage[] = messagesOf(
      history,
      context,
      withTools ? toolScope : undefined,
      withWeb,
    );
    /** the passages of the web an answer cites as it comes: cited by number */
    const cite = (cited: { url: string; title?: string; text?: string }[]) => {
      const numbers = new Set<number>();
      for (const c of cited) {
        let i = sources.findIndex((s) => s.href === c.url);
        if (i < 0) {
          sources.push({
            text: c.text ?? c.title ?? c.url,
            href: c.url,
            title: c.title,
          });
          i = sources.length - 1;
        }
        numbers.add(i + 1);
      }
      written += [...numbers].map((n) => `[${n}]`).join("");
      update(answer.id, { text: written, sources: [...sources] });
    };
    // MAX_ROUNDS rounds of calls, then the answer
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      let turnText = "";
      let calls: ToolCall[] = [];
      let raw: unknown;
      let stopReason: string | undefined;
      try {
        const tools = toolsNow();
        for await (const delta of chat({
          provider,
          model,
          messages,
          tools: tools.length ? tools : undefined,
          signal: controller.signal,
        })) {
          if (delta.type === "text") {
            // the text of each round apart
            if (!turnText && written.trim()) written += "\n\n";
            turnText += delta.text;
            written += delta.text;
            update(answer.id, { text: written });
          } else if (delta.type === "error")
            update(answer.id, { error: delta.message });
          else if (delta.type === "stop") {
            const said = stopMessage(delta.reason);
            if (said) update(answer.id, { error: said });
          } else if (delta.type === "cite") cite(delta.sources);
          else if (delta.type === "server_tool") {
            const what = delta.input?.query ?? delta.input?.url ?? "";
            steps.push(
              `${delta.name === "web_fetch" ? "read page" : "web search"}: ${String(what)}`,
            );
            update(answer.id, { steps: [...steps] });
          } else if (delta.type === "turn") {
            calls = delta.toolCalls;
            raw = delta.raw;
            stopReason = delta.stopReason;
          }
        }
      } catch (e) {
        // a model without the newer tools of the web: again, with the older
        if (
          round === 0 &&
          web === "anthropic" &&
          !basicWeb &&
          !written &&
          refusesWebTools(e)
        ) {
          basicWeb = true;
          round--;
          continue;
        }
        // the provider does not take tools: again, without
        if (round === 0 && withTools && !written && refusesTools(e)) {
          withTools = false;
          await searchAtFirst();
          sources.splice(0, sources.length, ...(context?.chunks ?? []));
          update(answer.id, { sources: [...sources], error: undefined });
          withWeb = withWeb && web === "anthropic";
          messages = messagesOf(history, context, undefined, withWeb);
          round--;
          continue;
        }
        throw e;
      }
      // the provider paused its own tools (web search): on, as it was
      if (
        stopReason === "pause_turn" &&
        calls.length === 0 &&
        round < MAX_ROUNDS
      ) {
        messages = [...messages, { role: "assistant", content: turnText, raw }];
        continue;
      }
      if (calls.length === 0 || round === MAX_ROUNDS) break;
      messages = [
        ...messages,
        { role: "assistant", content: turnText, toolCalls: calls, raw },
      ];
      const last = round === MAX_ROUNDS - 1;
      for (const call of calls) {
        const first = sources.length + 1;
        const result = isWebTool(call.name)
          ? await runWebTool(call, service, first)
          : toolScope
            ? await runTool(call, toolScope, first)
            : {
                text: `Error: No tool ${call.name}.`,
                chunks: [],
                step: `${call.name}: failed`,
              };
        sources.push(...result.chunks);
        steps.push(result.step);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: last ? result.text + NO_MORE_TOOLS : result.text,
        });
      }
      update(answer.id, { sources: [...sources], steps: [...steps] });
      if (controller.signal.aborted) break;
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
