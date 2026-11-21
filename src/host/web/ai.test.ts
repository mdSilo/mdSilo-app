import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { closeDB } from "./idb";
import {
  aiProviders,
  deleteProvider,
  saveProvider,
  storedProvider,
} from "./ai";

beforeEach(async () => {
  await closeDB();
  globalThis.indexedDB = new IDBFactory();
});

const input = {
  id: "openai",
  kind: "openai" as const,
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1/",
  settings: { chatModel: "m" },
};

test("keeps the key apart from what is shown", async () => {
  const shown = await saveProvider({ ...input, key: "sk-1" });
  expect(shown).toEqual({
    id: "openai",
    kind: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    settings: { chatModel: "m" },
    hasKey: true,
  });
  expect(JSON.stringify(await aiProviders())).not.toContain("sk-1");
  expect((await storedProvider("openai")).key).toBe("sk-1");

  // undefined keeps the key, '' forgets it
  await saveProvider({ ...input, label: "Mine" });
  expect((await storedProvider("openai")).key).toBe("sk-1");
  expect((await aiProviders())[0].label).toBe("Mine");
  await saveProvider({ ...input, key: "" });
  expect((await storedProvider("openai")).key).toBeUndefined();
  expect(await aiProviders()).toHaveLength(1);

  await deleteProvider("openai");
  expect(await aiProviders()).toEqual([]);
  await expect(storedProvider("openai")).rejects.toThrow();
});

test("refuses bad providers", async () => {
  await expect(
    saveProvider({ ...input, kind: "other" as "openai" }),
  ).rejects.toThrow();
  await expect(
    saveProvider({ ...input, baseUrl: "javascript:alert(1)" }),
  ).rejects.toThrow();
  await expect(saveProvider({ ...input, id: " " })).rejects.toThrow();
});
