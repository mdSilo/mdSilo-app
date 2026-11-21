import { create } from "zustand";
import { readWorkspaceList, writeWorkspaceList } from "@/custom/store";
import { languageName } from "../translate";
import type { Attached } from "./prompt";

/**
 * Prompts of the user (docs/ai.md, "Entry points"): a name and a template,
 * kept in the workspace (`.mdsilo/ai-prompts.json`), synced with it; shown in
 * the chat and in the AI menu of the editor.
 *
 * In the template: `{{selection}}` the text selected, `{{title}}` the title
 * of what it is from, `{{lang}}` the language to translate to.
 */

export const PROMPTS_FILE = "ai-prompts.json";

export type PromptPreset = {
  id: string;
  name: string;
  prompt: string;
  where: "workspace";
};

type PromptsState = {
  presets: PromptPreset[];
  load: () => Promise<void>;
  save: (presets: PromptPreset[]) => Promise<void>;
};

export const usePrompts = create<PromptsState>((set) => ({
  presets: [],
  load: async () => {
    const presets = await readWorkspaceList<PromptPreset>(PROMPTS_FILE);
    set({
      presets: presets.filter(
        (p) => typeof p.name === "string" && typeof p.prompt === "string",
      ),
    });
  },
  save: async (presets) => {
    await writeWorkspaceList(PROMPTS_FILE, presets);
    set({ presets });
  },
}));

/**
 * The prompt of a preset, its variables filled; the text selected put in it
 * (`inPrompt`) or left to be sent with it as usual.
 */
export function fillPrompt(
  template: string,
  { attached, lang }: { attached?: Attached; lang: string },
): { prompt: string; inPrompt: boolean } {
  const inPrompt = /\{\{\s*selection\s*\}\}/.test(template);
  const prompt = template
    .replace(/\{\{\s*selection\s*\}\}/g, attached?.text ?? "")
    .replace(/\{\{\s*title\s*\}\}/g, attached?.from ?? "")
    .replace(/\{\{\s*lang\s*\}\}/g, languageName(lang))
    .trim();
  return { prompt, inPrompt };
}
