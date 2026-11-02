import { invoke } from "@tauri-apps/api/core";
import { act, render, screen, waitFor } from "@testing-library/react";
import { store } from "@/state/store";
import { NoteMap } from "@/lib/noteMap";
import { makeNote, mockInvoke } from "@/testUtils";
import { parseManifest } from "../manifest";
import {
  contributesOf,
  disablePlugin,
  enablePlugin,
  type InstalledPlugin,
} from "../registry";
import { askPlugin } from "../background";
import { pluginCommands } from "../commands";
import PluginFrame from "../PluginFrame";
import {
  setModuleLoader,
  syncTrusted,
  trustedError,
  trustedPage,
} from "../trusted";
import { installDomHelpers } from "./dom";
import type { CommonJs } from ".";

/** An element with the helpers of Obsidian (dom.ts), as its typings have them */
type El = HTMLElement & {
  createDiv: (o?: unknown) => HTMLElement;
  createEl: (tag: string, o?: unknown) => HTMLElement;
  empty: () => void;
  addClass: (...c: string[]) => void;
  toggleClass: (c: string, on: boolean) => void;
  setText: (t: string) => void;
};
const asEl = (e: Element) => e as unknown as El;

/** The manifest of an Obsidian plugin, as it ships */
const obsidianManifest = {
  id: "hello",
  name: "Hello",
  version: "1.2.0",
  minAppVersion: "1.4.0",
  description: "Says hello",
  author: "Ann",
  isDesktopOnly: false,
};

const plugin: InstalledPlugin = {
  id: "hello",
  dir: "/data/hello",
  where: "device",
  hash: "",
  manifest: parseManifest(obsidianManifest),
};

/** main.js of an Obsidian plugin, as esbuild makes it: CommonJS */
const mainJs: CommonJs = (module, _exports, require) => {
  const { Plugin, PluginSettingTab, Setting, ItemView, Notice } =
    require("obsidian") as typeof import(".");
  class HelloView extends ItemView {
    getViewType() {
      return "hello-view";
    }
    async onOpen() {
      const content = this.containerEl.children[1] as HTMLElement;
      asEl(content).createEl("h4", { text: "Hello view" });
      const files = this.app.vault.getMarkdownFiles();
      asEl(content).createDiv({ cls: "count", text: `${files.length} notes` });
    }
  }
  class Tab extends PluginSettingTab {
    display() {
      asEl(this.containerEl).empty();
      new Setting(this.containerEl).setName("Greeting").addText((t) =>
        t
          .setValue((this.plugin as HelloPlugin).settings.greeting)
          .onChange(async (value) => {
            (this.plugin as HelloPlugin).settings.greeting = value;
            await this.plugin.saveData((this.plugin as HelloPlugin).settings);
          }),
      );
    }
  }
  class HelloPlugin extends Plugin {
    settings = { greeting: "Hello" };
    async onload() {
      this.settings = {
        ...this.settings,
        ...((await this.loadData()) as object),
      };
      this.addCommand({
        id: "say-hello",
        name: "Say hello",
        callback: () => new Notice(`${this.settings.greeting}!`),
      });
      this.addCommand({
        id: "in-editor",
        name: "Needs the editor",
        editorCallback: () => undefined,
      });
      this.registerMarkdownCodeBlockProcessor("hello", (source, el) => {
        asEl(el).createEl("b", { text: source.toUpperCase() });
        asEl(el).createEl("script", { text: "alert(1)" });
      });
      this.registerView("hello-view", (leaf) => new HelloView(leaf));
      this.addSettingTab(new Tab(this.app, this));
    }
  }
  module.exports = HelloPlugin;
};

let imported: string[];
let disk: Record<string, string>;

beforeEach(() => {
  imported = [];
  disk = { "/data/hello/data.json": '{"greeting":"Hi"}' };
  const note = makeNote({ id: "/ws/a.md", title: "a", content: "# A" });
  store.setState({
    initDir: "/ws",
    notes: NoteMap.from({ [note.id]: note }),
    installedPlugins: [plugin],
    pluginStates: {},
  });
  mockInvoke(invoke, {
    read_file: ({ filePath }: Record<string, unknown>) =>
      disk[filePath as string] ?? "",
    write_file: ({ filePath, text }: Record<string, unknown>) => {
      disk[filePath as string] = text as string;
      return true;
    },
  });
  setModuleLoader(async (url) => {
    imported.push(url);
    return { default: mainJs as never };
  });
  syncTrusted();
});

afterEach(() => {
  disablePlugin("hello");
  syncTrusted();
  document.querySelectorAll(".alert").forEach((el) => el.remove());
});

const start = async () => {
  enablePlugin(plugin);
  syncTrusted();
  await waitFor(() => expect(trustedPage(plugin, "settings")).toBeDefined());
};

it("reads the manifest of an Obsidian plugin as trusted, its main.js as CommonJS", async () => {
  expect(plugin.manifest).toMatchObject({
    mode: "trusted",
    compat: "obsidian",
    main: "main.js",
    minAppVersion: undefined,
    author: "Ann",
  });
  await start();
  expect(imported[0]).toMatch(/hello\/__cjs\/main\.js\?v=\d+$/);
  expect(trustedError("hello")).toBeUndefined();
});

it("adds its commands to the Plugins menu, those of the editor left out", async () => {
  await start();
  expect(pluginCommands().map((c) => c.command)).toEqual([
    { id: "say-hello", title: "Say hello" },
  ]);
  // with the settings it loaded
  await act(() => askPlugin(plugin, "command.run", { command: "say-hello" }));
  expect(screen.getByRole("status")).toHaveTextContent("Hi!");
});

it("draws its code blocks", async () => {
  await start();
  expect(contributesOf(plugin).codeBlocks).toEqual(["hello"]);
  const html = await askPlugin(plugin, "code.render", {
    lang: "hello",
    code: "x",
    dark: false,
  });
  expect(html).toContain("<b>X</b>");
});

it("shows its settings tab, which saves its data", async () => {
  await start();
  render(<PluginFrame plugin={plugin} page="settings" />);
  expect(await screen.findByText("Greeting")).toBeInTheDocument();
  const input = screen.getByDisplayValue("Hi") as HTMLInputElement;
  input.value = "Hey";
  input.dispatchEvent(new Event("change"));
  await waitFor(() =>
    expect(JSON.parse(disk["/data/hello/data.json"])).toEqual({
      greeting: "Hey",
    }),
  );
});

it("opens its views as views of the app", async () => {
  await start();
  expect(contributesOf(plugin).views).toEqual([
    { id: "hello-view", title: "Hello view", page: "hello-view" },
  ]);
  render(<PluginFrame plugin={plugin} page="hello-view" />);
  expect(await screen.findByText("Hello view")).toBeInTheDocument();
});

it("takes it all back when disabled", async () => {
  await start();
  expect(
    document.head.querySelector('link[href*="hello/styles.css"]'),
  ).not.toBeNull();
  disablePlugin("hello");
  syncTrusted();
  expect(contributesOf(plugin).commands).toEqual([]);
  expect(contributesOf(plugin).codeBlocks).toEqual([]);
  expect(trustedPage(plugin, "settings")).toBeUndefined();
  expect(
    document.head.querySelector('link[href*="hello/styles.css"]'),
  ).toBeNull();
});

it("gives elements the DOM helpers of Obsidian", () => {
  installDomHelpers();
  const el = asEl(document.createElement("div"));
  const div = el.createDiv({ cls: "a b", text: "hi", attr: { "data-x": 1 } });
  expect(div.outerHTML).toBe('<div class="a b" data-x="1">hi</div>');
  const link = el.createEl("a", { href: "https://x", text: "x" });
  expect(link.getAttribute("href")).toBe("https://x");
  el.addClass("c");
  el.toggleClass("c", false);
  expect(el.className).toBe("");
  el.empty();
  expect(el.childNodes).toHaveLength(0);
  el.setText("t");
  expect(el.textContent).toBe("t");
});
