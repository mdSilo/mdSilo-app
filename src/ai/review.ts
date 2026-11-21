import { store } from "@/state/store";
import { fromWorkspacePath } from "@/workspace/util";
import { writeNote } from "@/plugins/workspaceApi";
import { complete } from "./client";
import { CHATS_DIR } from "./chat/chatFile";
import { dayOf } from "./digest";
import { ownWords } from "./myself";

/**
 * The weekly review (docs/ai.md, "Chat with myself"): what the user read,
 * wrote and highlighted in the last seven days, by their notes changed then
 * (the annotations of books are notes too), kept as a note
 * `chats/<day> Weekly review.md`.
 */

const DAYS = 7;

const PROMPT = `Write the user's weekly review from the notes they wrote or changed this week: what they read, wrote and highlighted; the themes and the links between them; what is left open or unfinished; and three questions worth thinking about next. Link the notes you mention as [[note title]]. Markdown with short sections, in the language most of the notes are in. Speak to the user ("you"). No preamble.`;

/**
 * Make the review of the last seven days.
 * @returns the id of its note; none without a workspace or notes changed
 */
export async function makeWeeklyReview(
  now = new Date(),
): Promise<string | undefined> {
  const ws = store.getState().initDir;
  if (!ws) return undefined;
  const since = new Date(now.getTime() - DAYS * 86_400_000);
  const words = await ownWords({ since });
  if (!words.text) return undefined;
  const text = await complete({
    messages: [
      { role: "system", content: PROMPT },
      {
        role: "user",
        content: `My notes changed since ${dayOf(since)}:\n\n${words.text}`,
      },
    ],
  });
  const day = dayOf(now);
  const rel = `${CHATS_DIR}/${day} Weekly review.md`;
  const id = fromWorkspacePath(ws, rel);
  const body = [
    "---",
    `title: ${JSON.stringify(`Weekly review ${day}`)}`,
    "ai: review",
    `created: ${now.toISOString()}`,
    "---",
    "",
    text.trim(),
    "",
  ].join("\n");
  await writeNote({
    path: rel,
    text: body,
    create: !store.getState().notes.has(id),
  });
  return id;
}
