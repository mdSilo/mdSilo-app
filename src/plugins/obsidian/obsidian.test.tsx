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
  viewersOf,
  type InstalledPlugin,
} from "../registry";
import { askPlugin } from "../background";
import { pluginCommands } from "../commands";
import PluginFrame from "../PluginFrame";
import { fileMethods } from "../PluginFileView";
import {
  setModuleLoader,
  syncTrusted,
  trustedError,
  trustedPage,
} from "../trusted";
import { installDomHelpers } from "./dom";
import type { App, CommonJs } from ".";
import { frontMatterOf, withFrontMatter } from ".";

/** the view of a CSV file opened, as the plugin made it */
let csvView: import(".").TextFileView;
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
  const { Plugin, PluginSettingTab, Setting, ItemView, Notice, TextFileView } =
    obsidian;
  class CsvView extends TextFileView {
    getViewType() {
      return "csv-view";
    }
    setViewData(data: string) {
      super.setViewData(data, true);
      this.contentEl.textContent = `rows: ${data.split("\n").length}`;
    }
  }
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
        id: "shout",
        name: "Shout the selection",
        editorCallback: (editor) =>
          editor.replaceSelection(editor.getSelection().toUpperCase()),
      });
      this.registerEditorExtension(
        (
          require("@codemirror/view") as typeof import("@codemirror/view")
        ).EditorView.editable.of(true),
      );
      this.registerMarkdownCodeBlockProcessor("hello", (source, el) => {
        asEl(el).createEl("b", { text: source.toUpperCase() });
        asEl(el).createEl("script", { text: "alert(1)" });
      });
      this.registerView("hello-view", (leaf) => new HelloView(leaf));
      this.registerView("csv-view", (leaf) => (csvView = new CsvView(leaf)));
      this.registerExtensions(["csv"], "csv-view");
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

it("adds its commands to the Plugins menu", async () => {
  await start();
  expect(pluginCommands().map((c) => c.command)).toEqual([
    { id: "say-hello", title: "Say hello" },
    { id: "shout", title: "Shout the selection" },
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

it("opens the files of its extensions in its views", async () => {
  await start();
  disk["/ws/data.csv"] = "a,b\n1,2";
  expect(viewersOf("/ws/data.csv").map((v) => v.viewer)).toEqual([
    { extensions: ["csv"], title: "Hello", page: "csv-view" },
  ]);
  render(
    <PluginFrame
      plugin={plugin}
      page="csv-view"
      methods={fileMethods("/ws/data.csv", { current: null })}
    />,
  );
  expect(await screen.findByText("rows: 2")).toBeInTheDocument();
  expect(csvView.file).toMatchObject({ path: "data.csv", extension: "csv" });
  csvView.data = "a,b\n1,2\n3,4";
  await csvView.save();
  expect(disk["/ws/data.csv"]).toBe("a,b\n1,2\n3,4");
  // a view of the workspace is not given a file
  render(<PluginFrame plugin={plugin} page="hello-view" />);
  expect(await screen.findByText("Hello view")).toBeInTheDocument();
});

it("runs the commands of the editor on the note open, as WYSIWYG its text", async () => {
  await start();
  store.setState({ currentNoteId: "/ws/a.md" });
  store.getState().updateNote({ id: "/ws/a.md", content: "say hi" });
  const p = document.createElement("p");
  p.textContent = "hi";
  document.body.append(p);
  const range = document.createRange();
  range.selectNodeContents(p);
  getSelection()!.removeAllRanges();
  getSelection()!.addRange(range);
  await askPlugin(plugin, "command.run", { command: "shout" });
  expect(disk["/ws/a.md"]).toBe("say HI");
  p.remove();
  store.setState({ currentNoteId: "" });
  await expect(
    askPlugin(plugin, "command.run", { command: "shout" }),
  ).rejects.toThrow("Open a note");
});

it("adds its editor extensions to the Markdown mode, with the app's CodeMirror", async () => {
  const { useCmExtensions } = await import("../cmEditor");
  const { renderHook } = await import("@testing-library/react");
  const { result } = renderHook(() => useCmExtensions());
  expect(result.current).toHaveLength(0);
  await start();
  await waitFor(() => expect(result.current).toHaveLength(1));
  disablePlugin("hello");
  syncTrusted();
  await waitFor(() => expect(result.current).toHaveLength(0));
});

describe("more of Obsidian's API", () => {
  it("has the helpers plugins import", async () => {
    const o = await import(".");
    expect(o.parseFrontMatterTags({ tags: ["a", "#b"] })).toEqual(["#a", "#b"]);
    expect(o.parseFrontMatterTags({ tags: "a, b" })).toEqual(["#a", "#b"]);
    expect(o.parseFrontMatterTags({})).toBeNull();
    expect(
      o.Keymap.isModEvent(new MouseEvent("click", { ctrlKey: true })),
    ).toBe(true);
    expect(o.Keymap.isModEvent(new MouseEvent("click"))).toBe(false);
    const search = o.prepareSimpleSearch("foo BAR");
    expect(search("a bar and a foo")?.matches).toEqual([
      [12, 15],
      [2, 5],
    ]);
    expect(search("only foo")).toBeNull();
    const frag = o.sanitizeHTMLToDom("<b>x</b><script>alert(1)</script>");
    expect(frag.querySelector("b")?.textContent).toBe("x");
    expect(frag.querySelector("script")).toBeNull();
  });

  it("shows a menu, runs the item clicked, and closes", async () => {
    const { Menu } = await import(".");
    const clicked = vi.fn();
    const menu = new Menu().addItem((item) =>
      item.setTitle("Copy").setIcon("copy").onClick(clicked),
    );
    menu.showAtPosition({ x: 10, y: 20 });
    screen.getByRole("button", { name: "Copy" }).click();
    expect(clicked).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("lets a plugin register what mdSilo has not, without failing", async () => {
    const o = await import(".");
    class Suggest extends o.EditorSuggest<string> {}
    const p = new o.Plugin(new o.App({} as never, "x"), {
      id: "x",
      name: "X",
      version: "1",
      dir: "/x",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    p.registerEditorSuggest(new Suggest(p.app));
    p.registerObsidianProtocolHandler("open", () => undefined);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    const child = new o.MarkdownRenderChild(document.createElement("div"));
    const loaded = vi.spyOn(child, "onload");
    child.load();
    expect(loaded).toHaveBeenCalled();
  });
});

it("takes the canvases a code block drew as images", async () => {
  const { snapshot } = await import(".");
  const el = document.createElement("div");
  el.innerHTML = '<p>chart</p><canvas width="40" height="20"></canvas>';
  const toDataURL = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue("data:image/png;base64,AAAA");
  const html = await snapshot(el);
  expect(html).toBe(
    '<p>chart</p><img src="data:image/png;base64,AAAA" width="40" height="20">',
  );
  toDataURL.mockRestore();
  expect(
    await snapshot(
      Object.assign(document.createElement("div"), { innerHTML: "<b>x</b>" }),
    ),
  ).toBe("<b>x</b>");
});
