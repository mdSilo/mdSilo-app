import { invoke } from "@tauri-apps/api/core";
import type { NoteInfo, TrustedApi } from "@mdsilo/plugin-api";
import { store } from "@/state/store";
import { sanitizeHtml } from "@/lib/sanitize";
import { joinPath, toWorkspacePath } from "@/workspace/util";
import { dispatchView } from "../trusted";
import type { InstalledPlugin } from "../registry";
import { pluginUrl } from "../registry";
import { createEl, installDomHelpers } from "./dom";

/**
 * A partial layer for Obsidian plugins (docs/customization.md): their
 * main.js is CommonJS that does `require("obsidian")` and extends `Plugin`.
 * It runs as a trusted plugin, and this module is its `obsidian`: the
 * lifecycle, commands, ribbon icons (as commands), code block processors,
 * settings tabs, views, the vault and the metadata of notes, Notice and
 * Modal, and the DOM helpers. What touches the editor of Obsidian
 * (CodeMirror), its workspace layout or its internals is not there, so
 * only simple plugins run.
 */

type Callback = () => unknown;
type EventRef = { name: string; fn: (...args: unknown[]) => unknown };

export class Events {
  private handlers = new Map<string, Set<EventRef>>();
  on(name: string, fn: (...args: unknown[]) => unknown): EventRef {
    const ref = { name, fn };
    const set = this.handlers.get(name) ?? new Set();
    this.handlers.set(name, set);
    set.add(ref);
    return ref;
  }
  off(name: string, fn: (...args: unknown[]) => unknown) {
    for (const ref of this.handlers.get(name) ?? [])
      if (ref.fn === fn) this.handlers.get(name)?.delete(ref);
  }
  offref(ref: EventRef) {
    this.handlers.get(ref.name)?.delete(ref);
  }
  trigger(name: string, ...args: unknown[]) {
    for (const ref of this.handlers.get(name) ?? []) ref.fn(...args);
  }
}

export class Component {
  private cleanups: Callback[] = [];
  private children: Component[] = [];
  private loaded = false;
  load() {
    if (this.loaded) return;
    this.loaded = true;
    void this.onload();
    this.children.forEach((c) => c.load());
  }
  onload(): void | Promise<void> {}
  unload() {
    if (!this.loaded) return;
    this.loaded = false;
    this.children.forEach((c) => c.unload());
    for (const fn of this.cleanups.splice(0).reverse()) {
      try {
        fn();
      } catch (e) {
        console.error("Error on unloading:", e);
      }
    }
    this.onunload();
  }
  onunload() {}
  addChild<T extends Component>(child: T): T {
    this.children.push(child);
    if (this.loaded) child.load();
    return child;
  }
  removeChild<T extends Component>(child: T): T {
    this.children = this.children.filter((c) => c !== child);
    child.unload();
    return child;
  }
  register(fn: Callback) {
    this.cleanups.push(fn);
  }
  registerEvent(ref: EventRef & { source?: Events }) {
    this.register(() => ref.source?.offref(ref));
  }
  registerDomEvent(
    el: EventTarget,
    type: string,
    fn: EventListener,
    options?: AddEventListenerOptions,
  ) {
    el.addEventListener(type, fn, options);
    this.register(() => el.removeEventListener(type, fn, options));
  }
  registerInterval(id: number) {
    this.register(() => window.clearInterval(id));
    return id;
  }
}

/** Events whose refs know where they come from, for `registerEvent` */
class Source extends Events {
  on(name: string, fn: (...args: unknown[]) => unknown) {
    return Object.assign(super.on(name, fn), { source: this });
  }
}

export class TAbstractFile {
  vault!: Vault;
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
  stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot() {
    return this.path === "" || this.path === "/";
  }
}

const fileOf = (vault: Vault, note: NoteInfo): TFile => {
  const file = new TFile();
  const name = note.path.split("/").pop() ?? note.path;
  Object.assign(file, {
    vault,
    path: note.path,
    name,
    basename: name.replace(/\.[^.]+$/, ""),
    extension: name.includes(".") ? (name.split(".").pop() ?? "") : "",
    stat: {
      ctime: Date.parse(note.created) || 0,
      mtime: Date.parse(note.updated) || 0,
      size: 0,
    },
  });
  return file;
};

/** The notes of the workspace, as Obsidian's vault: paths relative to it */
export class Vault extends Source {
  /** the notes, read on load and on changes, for the calls that are not async */
  notes: NoteInfo[] = [];
  adapter: {
    read: (path: string) => Promise<string>;
    write: (path: string, text: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
  constructor(private api: TrustedApi) {
    super();
    const full = (path: string) =>
      joinPath(store.getState().initDir ?? "", normalizePath(path));
    this.adapter = {
      read: (path) => invoke<string>("read_file", { filePath: full(path) }),
      write: async (path, text) => {
        await invoke("write_file", { filePath: full(path), text });
      },
      exists: (path) => invoke<boolean>("file_exist", { filePath: full(path) }),
    };
  }
  async refresh() {
    this.notes = await this.api.call("notes.list");
  }
  getName() {
    return (store.getState().initDir ?? "").split(/[/\\]/).pop() ?? "";
  }
  getMarkdownFiles(): TFile[] {
    return this.notes.map((note) => fileOf(this, note));
  }
  getFiles(): TFile[] {
    return this.getMarkdownFiles();
  }
  getAbstractFileByPath(path: string): TFile | null {
    const note = this.notes.find((n) => n.path === normalizePath(path));
    return note ? fileOf(this, note) : null;
  }
  getFileByPath(path: string) {
    return this.getAbstractFileByPath(path);
  }
  read(file: TFile) {
    return this.api.call("notes.read", { path: file.path });
  }
  cachedRead(file: TFile) {
    return this.read(file);
  }
  async modify(file: TFile, text: string) {
    await this.api.call("notes.write", { path: file.path, text });
    this.trigger("modify", file);
  }
  async process(file: TFile, fn: (text: string) => string) {
    const text = fn(await this.read(file));
    await this.modify(file, text);
    return text;
  }
  create(): Promise<TFile> {
    return Promise.reject(new Error("Creating files is not supported yet"));
  }
}

type CachedMetadata = {
  tags: { tag: string }[];
  links: { link: string; displayText: string }[];
  frontmatter?: Record<string, unknown>;
};

/** Tags and links of the notes, from the index of the app */
export class MetadataCache extends Source {
  constructor(private vault: Vault) {
    super();
  }
  getFileCache(file: TFile): CachedMetadata | null {
    const note = this.vault.notes.find((n) => n.path === file.path);
    if (!note) return null;
    return {
      tags: note.tags.map((tag) => ({ tag: `#${tag}` })),
      links: note.links.map((link) => ({ link, displayText: link })),
    };
  }
  getCache(path: string) {
    const file = this.vault.getAbstractFileByPath(path);
    return file ? this.getFileCache(file) : null;
  }
  getFirstLinkpathDest(link: string): TFile | null {
    const note = this.vault.notes.find((n) => n.title === link);
    return note ? fileOf(this.vault, note) : null;
  }
  /** source path → target path → count */
  get resolvedLinks(): Record<string, Record<string, number>> {
    const byTitle = new Map(this.vault.notes.map((n) => [n.title, n.path]));
    return Object.fromEntries(
      this.vault.notes.map((n) => [
        n.path,
        Object.fromEntries(
          n.links
            .map((l) => byTitle.get(l))
            .filter((p): p is string => Boolean(p))
            .map((p) => [p, 1]),
        ),
      ]),
    );
  }
}

/** A place to show a view; one per view opened */
export class WorkspaceLeaf {
  view: ItemView | null = null;
  constructor(
    public app: App,
    private plugin: string,
  ) {}
  async setViewState(state: { type: string }) {
    this.app.workspace.openView(this.plugin, state.type);
  }
  detach() {}
}

export class Workspace extends Source {
  layoutReady = false;
  constructor(
    private app: App,
    private plugin: string,
  ) {
    super();
  }
  onLayoutReady(fn: Callback) {
    queueMicrotask(() => fn());
  }
  getActiveFile(): TFile | null {
    const { currentNoteId, initDir } = store.getState();
    if (!currentNoteId || !initDir) return null;
    const path = toWorkspacePath(initDir, currentNoteId);
    return this.app.vault.getAbstractFileByPath(path);
  }
  getLeavesOfType(): WorkspaceLeaf[] {
    return [];
  }
  getLeaf() {
    return new WorkspaceLeaf(this.app, this.plugin);
  }
  getRightLeaf() {
    return this.getLeaf();
  }
  revealLeaf() {}
  detachLeavesOfType() {}
  /** opens a view registered by the plugin, by its type */
  openView(plugin: string, type: string) {
    dispatchView({ view: "plugin", plugin, viewId: type });
  }
  async openLinkText(link: string) {
    const file = this.app.metadataCache.getFirstLinkpathDest(link);
    await this.app.api.call("app.open", { note: file?.path ?? link });
  }
}

export class App {
  vault: Vault;
  metadataCache: MetadataCache;
  workspace: Workspace;
  constructor(
    public api: TrustedApi,
    plugin: string,
  ) {
    this.vault = new Vault(api);
    this.metadataCache = new MetadataCache(this.vault);
    this.workspace = new Workspace(this, plugin);
  }
}

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  dir: string;
};

type Command = {
  id: string;
  name: string;
  callback?: () => unknown;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: unknown;
  editorCheckCallback?: unknown;
};

type CodeBlockProcessor = (
  source: string,
  el: HTMLElement,
  ctx: { sourcePath: string; getSectionInfo: () => null; addChild: Callback },
) => unknown;

/** What an Obsidian plugin registers, handed to the app by `obsidianActivate` */
type Registry = {
  commands: Map<string, Command>;
  codeBlocks: Map<string, CodeBlockProcessor>;
  views: Map<string, (leaf: WorkspaceLeaf) => ItemView>;
  settings?: PluginSettingTab;
};

const registries = new WeakMap<Plugin, Registry>();

export class Plugin extends Component {
  constructor(
    public app: App,
    public manifest: PluginManifest,
  ) {
    super();
    registries.set(this, {
      commands: new Map(),
      codeBlocks: new Map(),
      views: new Map(),
    });
  }
  private get registry() {
    return registries.get(this)!;
  }
  private get api() {
    return this.app.api;
  }
  addCommand(command: Command) {
    const id = command.id.replace(/^.*:/, "");
    if (!command.callback && !command.checkCallback) {
      console.warn(
        `${this.manifest.id}: the command ${id} needs the editor of Obsidian, left out`,
      );
      return command;
    }
    this.registry.commands.set(id, command);
    this.register(this.api.contribute("commands", { id, title: command.name }));
    return command;
  }
  addRibbonIcon(
    icon: string,
    title: string,
    callback: (e: MouseEvent) => unknown,
  ) {
    const id = `ribbon-${this.registry.commands.size}`;
    this.registry.commands.set(id, {
      id,
      name: title,
      callback: () => callback(new MouseEvent("click")),
    });
    this.register(this.api.contribute("commands", { id, title }));
    return createEl("div", {
      attr: { "aria-label": title, "data-icon": icon },
    });
  }
  addStatusBarItem() {
    return createEl("div");
  }
  addSettingTab(tab: PluginSettingTab) {
    this.registry.settings = tab;
    this.register(
      this.api.page("settings", (el) => {
        tab.containerEl = el;
        tab.display();
        return () => tab.hide();
      }),
    );
  }
  registerMarkdownCodeBlockProcessor(
    lang: string,
    processor: CodeBlockProcessor,
  ) {
    const name = lang.toLowerCase();
    this.registry.codeBlocks.set(name, processor);
    this.register(this.api.contribute("codeBlocks", name));
  }
  registerMarkdownPostProcessor() {
    // drawn by mdsmirror, there is no rendered markdown to process
  }
  registerView(type: string, creator: (leaf: WorkspaceLeaf) => ItemView) {
    this.registry.views.set(type, creator);
    const title = type
      .replace(/[-_]+/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());
    this.register(
      this.api.contribute("views", { id: type, title, page: type }),
    );
    this.register(
      this.api.page(type, (el) => {
        const leaf = new WorkspaceLeaf(this.app, this.manifest.id);
        const view = creator(leaf);
        leaf.view = view;
        el.append(view.containerEl);
        view.load();
        void view.onOpen();
        return () => {
          void view.onClose();
          view.unload();
          view.containerEl.remove();
        };
      }),
    );
  }
  registerExtensions(extensions: string[]) {
    console.warn(
      `${this.manifest.id}: opening .${extensions.join(", .")} files is not supported`,
    );
  }
  registerEditorExtension() {
    console.warn(
      `${this.manifest.id}: extensions of Obsidian's editor are not supported`,
    );
  }
  async loadData(): Promise<unknown> {
    try {
      const text = await invoke<string>("read_file", {
        filePath: joinPath(this.manifest.dir, "data.json"),
      });
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
  async saveData(data: unknown) {
    await invoke("write_file", {
      filePath: joinPath(this.manifest.dir, "data.json"),
      text: JSON.stringify(data, null, 2),
    });
  }
}

export class ItemView extends Component {
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  app: App;
  constructor(public leaf: WorkspaceLeaf) {
    super();
    this.app = leaf.app;
    // as in Obsidian: a header, then the content, `containerEl.children[1]`
    this.containerEl = createEl("div", { cls: "view-content-container" });
    this.containerEl.style.cssText =
      "height:100%;display:flex;flex-direction:column";
    const header = createEl("div", {
      cls: "view-header",
      parent: this.containerEl,
    });
    header.style.display = "none";
    this.contentEl = createEl("div", {
      cls: "view-content",
      parent: this.containerEl,
    });
    this.contentEl.style.cssText = "flex:1;overflow:auto;padding:1rem";
  }
  getViewType() {
    return "";
  }
  getDisplayText() {
    return "";
  }
  getIcon() {
    return "";
  }
  async onOpen() {}
  async onClose() {}
}

export class MarkdownView extends ItemView {}
export class FileView extends ItemView {}

export class PluginSettingTab {
  containerEl: HTMLElement = createEl("div");
  constructor(
    public app: App,
    public plugin: Plugin,
  ) {}
  display() {}
  hide() {}
}

class ValueComponent<T> {
  protected handlers: ((value: T) => unknown)[] = [];
  constructor(
    protected el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  ) {
    el.addEventListener("change", () => this.changed());
  }
  protected changed() {
    const value = this.getValue();
    this.handlers.forEach((fn) => fn(value));
  }
  getValue(): T {
    return this.el.value as T;
  }
  setValue(value: T) {
    this.el.value = String(value ?? "");
    return this;
  }
  onChange(fn: (value: T) => unknown) {
    this.handlers.push(fn);
    return this;
  }
  setDisabled(disabled: boolean) {
    this.el.disabled = disabled;
    return this;
  }
  setPlaceholder(text: string) {
    this.el.setAttribute("placeholder", text);
    return this;
  }
}

export class TextComponent extends ValueComponent<string> {
  inputEl: HTMLInputElement;
  constructor(containerEl: HTMLElement) {
    const input = createEl("input", {
      type: "text",
      cls: "input input-sm",
      parent: containerEl,
    });
    super(input);
    this.inputEl = input;
  }
}

export class TextAreaComponent extends ValueComponent<string> {
  inputEl: HTMLTextAreaElement;
  constructor(containerEl: HTMLElement) {
    const input = createEl("textarea", {
      cls: "textarea textarea-sm",
      parent: containerEl,
    });
    super(input);
    this.inputEl = input;
  }
}

export class ToggleComponent extends ValueComponent<boolean> {
  toggleEl: HTMLInputElement;
  constructor(containerEl: HTMLElement) {
    const input = createEl("input", {
      type: "checkbox",
      cls: "toggle toggle-sm",
      parent: containerEl,
    });
    super(input);
    this.toggleEl = input;
  }
  getValue() {
    return this.toggleEl.checked;
  }
  setValue(on: boolean) {
    this.toggleEl.checked = on;
    return this;
  }
}

export class SliderComponent extends ValueComponent<number> {
  sliderEl: HTMLInputElement;
  constructor(containerEl: HTMLElement) {
    const input = createEl("input", {
      type: "range",
      cls: "range range-sm",
      parent: containerEl,
    });
    super(input);
    this.sliderEl = input;
  }
  getValue() {
    return Number(this.sliderEl.value);
  }
  setLimits(min: number, max: number, step: number | "any") {
    Object.assign(this.sliderEl, {
      min: String(min),
      max: String(max),
      step: String(step),
    });
    return this;
  }
  setDynamicTooltip() {
    return this;
  }
}

export class DropdownComponent extends ValueComponent<string> {
  selectEl: HTMLSelectElement;
  constructor(containerEl: HTMLElement) {
    const select = createEl("select", {
      cls: "select select-sm",
      parent: containerEl,
    });
    super(select);
    this.selectEl = select;
  }
  addOption(value: string, display: string) {
    createEl("option", { value, text: display, parent: this.selectEl });
    return this;
  }
  addOptions(options: Record<string, string>) {
    for (const [value, display] of Object.entries(options))
      this.addOption(value, display);
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;
  constructor(containerEl: HTMLElement) {
    this.buttonEl = createEl("button", {
      type: "button",
      cls: "btn btn-sm",
      parent: containerEl,
    });
  }
  setButtonText(text: string) {
    this.buttonEl.textContent = text;
    return this;
  }
  setCta() {
    this.buttonEl.classList.add("btn-primary");
    return this;
  }
  setWarning() {
    this.buttonEl.classList.add("btn-error");
    return this;
  }
  setIcon() {
    return this;
  }
  setTooltip(text: string) {
    this.buttonEl.title = text;
    return this;
  }
  setDisabled(disabled: boolean) {
    this.buttonEl.disabled = disabled;
    return this;
  }
  onClick(fn: (e: MouseEvent) => unknown) {
    this.buttonEl.addEventListener("click", (e) => fn(e));
    return this;
  }
}

/** A row of a settings tab: a name, a description, controls */
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.settingEl = createEl("div", {
      cls: "setting-item",
      parent: containerEl,
    });
    this.settingEl.style.cssText =
      "display:flex;align-items:center;gap:1rem;padding:0.5rem 0;border-bottom:1px solid var(--color-base-300)";
    this.infoEl = createEl("div", {
      cls: "setting-item-info",
      parent: this.settingEl,
    });
    this.infoEl.style.flex = "1";
    this.nameEl = createEl("div", {
      cls: "setting-item-name",
      parent: this.infoEl,
    });
    this.descEl = createEl("div", {
      cls: "setting-item-description text-xs opacity-70",
      parent: this.infoEl,
    });
    this.controlEl = createEl("div", {
      cls: "setting-item-control",
      parent: this.settingEl,
    });
    this.controlEl.style.cssText = "display:flex;gap:0.5rem;align-items:center";
  }
  setName(name: string | DocumentFragment) {
    this.nameEl.replaceChildren(name);
    return this;
  }
  setDesc(desc: string | DocumentFragment) {
    this.descEl.replaceChildren(desc);
    return this;
  }
  setHeading() {
    this.nameEl.classList.add("font-semibold");
    return this;
  }
  setClass(cls: string) {
    this.settingEl.classList.add(cls);
    return this;
  }
  setDisabled(disabled: boolean) {
    this.settingEl.style.opacity = disabled ? "0.5" : "";
    return this;
  }
  private add<T>(component: T, fn: (c: T) => unknown) {
    fn(component);
    return this;
  }
  addText(fn: (c: TextComponent) => unknown) {
    return this.add(new TextComponent(this.controlEl), fn);
  }
  addTextArea(fn: (c: TextAreaComponent) => unknown) {
    return this.add(new TextAreaComponent(this.controlEl), fn);
  }
  addToggle(fn: (c: ToggleComponent) => unknown) {
    return this.add(new ToggleComponent(this.controlEl), fn);
  }
  addSlider(fn: (c: SliderComponent) => unknown) {
    return this.add(new SliderComponent(this.controlEl), fn);
  }
  addDropdown(fn: (c: DropdownComponent) => unknown) {
    return this.add(new DropdownComponent(this.controlEl), fn);
  }
  addButton(fn: (c: ButtonComponent) => unknown) {
    return this.add(new ButtonComponent(this.controlEl), fn);
  }
  addExtraButton(fn: (c: ButtonComponent) => unknown) {
    return this.addButton(fn);
  }
}

/** A message at the bottom of the window, gone after `timeout` ms */
export class Notice {
  noticeEl: HTMLElement;
  constructor(message: string | DocumentFragment, timeout = 5000) {
    this.noticeEl = createEl("div", {
      cls: "alert shadow-lg",
      parent: document.body,
      attr: { role: "status" },
    });
    this.noticeEl.style.cssText =
      "position:fixed;right:1rem;bottom:1rem;z-index:100;max-width:24rem;width:auto";
    this.noticeEl.append(message);
    if (timeout > 0) setTimeout(() => this.hide(), timeout);
  }
  setMessage(message: string | DocumentFragment) {
    this.noticeEl.replaceChildren(message);
    return this;
  }
  hide() {
    this.noticeEl.remove();
  }
}

/** A dialog over the app */
export class Modal {
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };
  constructor(public app: App) {
    this.containerEl = createEl("div", { cls: "modal modal-open" });
    this.containerEl.style.zIndex = "90";
    this.modalEl = createEl("div", {
      cls: "modal-box",
      parent: this.containerEl,
    });
    this.titleEl = createEl("h3", {
      cls: "text-lg font-semibold mb-2",
      parent: this.modalEl,
    });
    this.contentEl = createEl("div", { parent: this.modalEl });
    const backdrop = createEl("div", {
      cls: "modal-backdrop",
      parent: this.containerEl,
    });
    backdrop.addEventListener("click", () => this.close());
  }
  setTitle(title: string) {
    this.titleEl.textContent = title;
    return this;
  }
  setContent(content: string | DocumentFragment) {
    this.contentEl.replaceChildren(content);
    return this;
  }
  open() {
    document.body.append(this.containerEl);
    document.addEventListener("keydown", this.onKey);
    this.onOpen();
  }
  close() {
    document.removeEventListener("keydown", this.onKey);
    this.containerEl.remove();
    this.onClose();
  }
  onOpen() {}
  onClose() {}
}

export const MarkdownRenderer = {
  async render(_app: App, markdown: string, el: HTMLElement): Promise<void> {
    const { renderToHtml } = await import("mdsmirror");
    el.innerHTML = sanitizeHtml(renderToHtml(markdown));
  },
  async renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
    return MarkdownRenderer.render(null as unknown as App, markdown, el);
  },
};

export function normalizePath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  wait = 0,
  resetTimer = false,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (timer && !resetTimer) return debounced;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, wait);
    return debounced;
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    return debounced;
  };
  return debounced;
}

export const Platform = {
  isDesktop: true,
  isDesktopApp: true,
  isMobile: false,
  isMobileApp: false,
  isMacOS: navigator.userAgent.includes("Mac"),
  isWin: navigator.userAgent.includes("Windows"),
  isLinux: navigator.userAgent.includes("Linux"),
};

export function setIcon(el: HTMLElement, icon: string) {
  el.dataset.icon = icon;
}
export function addIcon() {}

export async function requestUrl(
  request:
    | string
    | {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      },
) {
  const { url, ...init } =
    typeof request === "string" ? { url: request } : request;
  const response = await fetch(url, init);
  const arrayBuffer = await response.arrayBuffer();
  const text = new TextDecoder().decode(arrayBuffer);
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    arrayBuffer,
    text,
    get json() {
      return JSON.parse(text) as unknown;
    },
  };
}

export const request = async (r: Parameters<typeof requestUrl>[0]) =>
  (await requestUrl(r)).text;

/** The `obsidian` module the plugins require */
const obsidianModule = {
  App,
  ButtonComponent,
  Component,
  DropdownComponent,
  Events,
  FileView,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  SliderComponent,
  TAbstractFile,
  TFile,
  TFolder,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
  Vault,
  Workspace,
  WorkspaceLeaf,
  addIcon,
  debounce,
  normalizePath,
  request,
  requestUrl,
  setIcon,
};

export type CommonJs = (
  module: { exports: unknown },
  exports: unknown,
  require: (name: string) => unknown,
) => void;

/**
 * The `activate` of a trusted plugin for an Obsidian plugin: runs its
 * main.js (served as a module by the plugin scheme, see plugin_scheme.rs),
 * makes its Plugin with the app above, and maps what it registers.
 */
export function obsidianActivate(run: CommonJs, plugin: InstalledPlugin) {
  return async (api: TrustedApi) => {
    installDomHelpers();
    const module = { exports: {} as unknown };
    run(module, module.exports, (name) => {
      if (name === "obsidian") return obsidianModule;
      throw new Error(`${plugin.id} needs ${name}, which mdSilo does not have`);
    });
    const exported = module.exports as { default?: unknown };
    const PluginClass = (exported.default ?? exported) as new (
      app: App,
      manifest: PluginManifest,
    ) => Plugin;
    if (typeof PluginClass !== "function")
      throw new Error("main.js exports no plugin");

    const app = new App(api, plugin.id);
    await app.vault.refresh().catch(() => undefined);
    const manifest = plugin.manifest!;
    const instance = new PluginClass(app, {
      id: plugin.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      dir: plugin.dir,
    });
    const registry = registries.get(instance)!;

    api.handle("command.run", async ({ command }) => {
      const found = registry.commands.get(command);
      if (!found) throw new Error(`Unknown command: ${command}`);
      if (found.checkCallback) found.checkCallback(false);
      else await found.callback?.();
    });
    api.handle("code.render", async ({ lang, code }) => {
      const processor = registry.codeBlocks.get(lang);
      if (!processor) throw new Error(`No code block ${lang}`);
      const el = createEl("div");
      const active = app.workspace.getActiveFile();
      await processor(code, el, {
        sourcePath: active?.path ?? "",
        getSectionInfo: () => null,
        addChild: () => undefined,
      });
      return el.innerHTML;
    });

    // its styles, as Obsidian loads them
    const link = createEl("link", {
      attr: { rel: "stylesheet", href: pluginUrl(plugin.id, "styles.css") },
      parent: document.head,
    });
    // what the app changes, as Obsidian tells of it
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.currentNoteId !== prev.currentNoteId)
        app.workspace.trigger("file-open", app.workspace.getActiveFile());
      if (state.notes !== prev.notes)
        void app.vault
          .refresh()
          .then(() => app.metadataCache.trigger("resolved"));
    });
    api.onUnload(() => {
      unsubscribe();
      link.remove();
      instance.unload();
    });
    instance.load();
    app.workspace.layoutReady = true;
    app.workspace.trigger("layout-change");
  };
}
