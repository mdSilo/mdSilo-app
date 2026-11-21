import { complete } from "./client";

/**
 * Translation by the AI provider of quick tasks, one of the services of the
 * translation popup, the word lens and the translation of whole books.
 */

/** The name of a language in English, e.g. zh-CN → Chinese (China): what a model knows best. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const SYSTEM =
  "You are a translator. Translate the text the user gives into the language asked. Reply with the translation only: no notes, no quotes around it, no explanation. Keep line breaks, Markdown and names as they are. If the text is already in that language, reply with it unchanged.";

export async function aiTranslate(text: string, to: string): Promise<string> {
  const answer = await complete({
    role: "fast",
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Translate into ${languageName(to)}:\n\n${text}`,
      },
    ],
  });
  return answer.trim();
}
