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
import type { App, CommonJs } from ".";
import { frontMatterOf, withFrontMatter } from ".";

/** the app of the plugin running, as it got it */
let app: App;
/** what `require("obsidian")` gave it */
let obsidian: typeof import(".") & Record<string, unknown>;

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
  obsidian = require("obsidian") as typeof obsidian;
  const { Plugin, PluginSettingTab, Setting, ItemView, Notice } = obsidian;
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
      app = this.app;
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
    file_exist: ({ filePath }: Record<string, unknown>) =>
      (filePath as string) in disk,
    create_dir_recursive: true,
    get_dirpath: ({ path }: Record<string, unknown>) =>
      String(path).replace(/\/[^/]*$/, ""),
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

it("creates notes in the vault, not over one there", async () => {
  await start();
  const created = vi.fn();
  app.vault.on("create", created);
  const file = await app.vault.create("new/b.md", "# B");
  expect(file).toMatchObject({ path: "new/b.md", basename: "b" });
  expect(disk["/ws/new/b.md"]).toBe("# B");
  expect(app.vault.getMarkdownFiles().map((f) => f.path)).toContain("new/b.md");
  expect(created).toHaveBeenCalledWith(file);
  await expect(app.vault.create("a.md", "x")).rejects.toThrow(
    "File already exists.",
  );
  await app.vault.append(file, "\nmore");
  expect(disk["/ws/new/b.md"]).toBe("# B\nmore");
});

it("reads and sets the front matter of notes", async () => {
  await start();
  store.getState().updateNote({
    id: "/ws/a.md",
    content: "---\ntags: [x, y]\ndraft: true\n---\n# A",
  });
  const file = app.vault.getAbstractFileByPath("a.md")!;
  expect(app.metadataCache.getFileCache(file)?.frontmatter).toEqual({
    tags: ["x", "y"],
    draft: true,
  });
  disk["/ws/a.md"] = store.getState().notes.get("/ws/a.md")!.content;
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.draft = false;
    fm.title = "A";
  });
  expect(
    frontMatterOf(store.getState().notes.get("/ws/a.md")!.content),
  ).toEqual({
    tags: ["x", "y"],
    draft: false,
    title: "A",
  });
});

it("parses front matter as YAML, and writes it", () => {
  expect(frontMatterOf("# no")).toBeUndefined();
  expect(frontMatterOf("---\n: [broken\n---\nx")).toBeUndefined();
  expect(frontMatterOf("---\n---\nx")).toBeUndefined();
  expect(withFrontMatter("# A", { a: 1 })).toBe("---\na: 1\n---\n# A");
  expect(withFrontMatter("---\na: 1\n---\n# A", {})).toBe("# A");
});

it("gives moment, and the YAML helpers", async () => {
  await start();
  const moment = obsidian.moment as unknown as (d: string) => {
    format: (f: string) => string;
  };
  expect(moment("2026-11-02").format("YYYY/MM/DD")).toBe("2026/11/02");
  expect((window as unknown as { moment: unknown }).moment).toBe(moment);
  expect((obsidian.parseYaml as (t: string) => unknown)("a: [1]")).toEqual({
    a: [1],
  });
});
