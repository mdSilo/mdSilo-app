/**
 * The DOM helpers Obsidian adds to elements, which its plugins use
 * everywhere: `el.createDiv({ cls })`, `el.empty()`… Added once, the first
 * time an Obsidian plugin loads, and only those the browser doesn't have.
 */

export type DomInfo = {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  href?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  parent?: Node;
  prepend?: boolean;
};

type Callback<T> = (el: T) => void;

const classes = (cls: string | string[]) =>
  (Array.isArray(cls) ? cls : cls.split(" ")).filter(Boolean);

const infoOf = (o?: DomInfo | string): DomInfo =>
  typeof o === "string" ? { cls: o } : (o ?? {});

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  o?: DomInfo | string,
  callback?: Callback<HTMLElementTagNameMap[K]>,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const info = infoOf(o);
  if (info.cls) el.classList.add(...classes(info.cls));
  if (info.text !== undefined) {
    if (typeof info.text === "string") el.textContent = info.text;
    else el.append(info.text);
  }
  for (const key of [
    "title",
    "href",
    "type",
    "value",
    "placeholder",
  ] as const) {
    if (info[key] !== undefined) el.setAttribute(key, info[key]);
  }
  for (const [key, value] of Object.entries(info.attr ?? {})) {
    if (value === null || value === false) el.removeAttribute(key);
    else el.setAttribute(key, String(value));
  }
  if (info.parent) {
    if (info.prepend) info.parent.insertBefore(el, info.parent.firstChild);
    else info.parent.appendChild(el);
  }
  callback?.(el);
  return el;
}

type Helpers = Record<string, (this: HTMLElement, ...args: never[]) => unknown>;

const helpers: Helpers = {
  createEl(
    tag: string,
    o?: DomInfo | string,
    callback?: Callback<HTMLElement>,
  ) {
    return createEl(
      tag as keyof HTMLElementTagNameMap,
      { ...infoOf(o), parent: this },
      callback,
    );
  },
  createDiv(o?: DomInfo | string, callback?: Callback<HTMLElement>) {
    return createEl("div", { ...infoOf(o), parent: this }, callback);
  },
  createSpan(o?: DomInfo | string, callback?: Callback<HTMLElement>) {
    return createEl("span", { ...infoOf(o), parent: this }, callback);
  },
  empty() {
    this.replaceChildren();
  },
  addClass(...cls: string[]) {
    this.classList.add(...cls.flatMap(classes));
  },
  addClasses(cls: string[]) {
    this.classList.add(...cls);
  },
  removeClass(...cls: string[]) {
    this.classList.remove(...cls.flatMap(classes));
  },
  toggleClass(cls: string | string[], on: boolean) {
    for (const c of classes(cls)) this.classList.toggle(c, on);
  },
  hasClass(cls: string) {
    return this.classList.contains(cls);
  },
  setText(text: string | DocumentFragment) {
    if (typeof text === "string") this.textContent = text;
    else this.replaceChildren(text);
  },
  appendText(text: string) {
    this.append(text);
  },
  setAttr(key: string, value: string | number | boolean | null) {
    if (value === null || value === false) this.removeAttribute(key);
    else this.setAttribute(key, String(value));
  },
  setAttrs(attrs: Record<string, string | number | boolean | null>) {
    for (const [key, value] of Object.entries(attrs))
      helpers.setAttr.call(this, key as never, value as never);
  },
  getText() {
    return this.textContent ?? "";
  },
  detach() {
    this.remove();
  },
  show() {
    this.style.display = "";
  },
  hide() {
    this.style.display = "none";
  },
  toggle(show: boolean) {
    this.style.display = show ? "" : "none";
  },
};

let installed = false;

/** Adds the helpers to the elements of the app, and `createEl`… to `window`. */
export function installDomHelpers() {
  if (installed) return;
  installed = true;
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  for (const [name, fn] of Object.entries(helpers)) {
    if (!(name in proto))
      Object.defineProperty(proto, name, {
        value: fn,
        configurable: true,
        writable: true,
      });
  }
  const fragment = DocumentFragment.prototype as unknown as Record<
    string,
    unknown
  >;
  for (const name of ["createEl", "createDiv", "createSpan", "empty"]) {
    if (!(name in fragment))
      Object.defineProperty(fragment, name, {
        value: helpers[name],
        configurable: true,
        writable: true,
      });
  }
  const win = window as unknown as Record<string, unknown>;
  win.createEl ??= createEl;
  win.createDiv ??= (o?: DomInfo | string, cb?: Callback<HTMLDivElement>) =>
    createEl("div", o, cb);
  win.createSpan ??= (o?: DomInfo | string, cb?: Callback<HTMLSpanElement>) =>
    createEl("span", o, cb);
  win.createFragment ??= (cb?: Callback<DocumentFragment>) => {
    const f = document.createDocumentFragment();
    cb?.(f);
    return f;
  };
  win.activeDocument ??= document;
  win.activeWindow ??= window;
}
