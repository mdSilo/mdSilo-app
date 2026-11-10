/**
 * The manifest of a plugin, `manifest.json` at the root of its folder. A
 * plugin runs in a sandboxed iframe unless it is `trusted`, and can only do
 * what its permissions, granted by the user, allow. See docs/customization.md.
 */

import {
  PERMISSIONS,
  type Permission,
  type PluginManifest,
  type Contributes,
  type SelectionPlace,
} from "@mdsilo/plugin-api";
import { tk } from "@/i18n";

// the types are of @mdsilo/plugin-api, for the app and the authors of plugins alike
export { PERMISSIONS };
export type {
  CommandContribution,
  Contributes,
  NoteModeContribution,
  ReaderPanelContribution,
  Permission,
  PluginManifest,
  PluginMode,
  SelectionAction,
  SelectionPlace,
  ViewContribution,
  ViewerContribution,
} from "@mdsilo/plugin-api";

/** What a permission lets a plugin do, to show the user */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "file:read": tk("Read the file it opens"),
  "file:write": tk("Change the file it opens"),
  "notes:read": tk("Read your notes"),
  "notes:write": tk("Change your notes"),
  "books:read": tk("Read your library"),
  "issues:read": tk("Read your issues"),
  "reader:read": tk("Read the book open, where you are in it, and move in it"),
  net: tk("Reach the internet"),
};

export const MANIFEST_FILE = "manifest.json";

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VERSION = /^\d+(\.\d+){0,2}([-+].*)?$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`"${field}" should be a text`);
  return value.trim();
};

const optionalText = (value: unknown, field: string): string | undefined =>
  value === undefined ? undefined : text(value, field);

const list = (value: unknown, field: string): unknown[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`"${field}" should be a list`);
  return value;
};

/** A path inside the folder of the plugin */
const innerPath = (value: unknown, field: string): string => {
  const path = text(value, field).replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    path.startsWith("/") ||
    /^[a-z]+:/i.test(path) ||
    path.split("/").includes("..")
  ) {
    throw new Error(`"${field}" should be a path inside the plugin`);
  }
  return path;
};

/** An image inside the plugin, as browsers show in an <img> */
const imagePath = (value: unknown, field: string): string => {
  const path = innerPath(value, field);
  if (!/\.(svg|png|webp|jpe?g|gif)$/i.test(path))
    throw new Error(`"${field}" should be an SVG, PNG, WebP, JPEG or GIF`);
  return path;
};

/** `.CSV` → `csv` */
const extension = (value: unknown, field: string): string => {
  const ext = text(value, field).replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext))
    throw new Error(`"${field}" should be a file extension`);
  return ext;
};

function parseContributes(value: unknown): Contributes {
  if (value === undefined)
    return {
      viewers: [],
      views: [],
      codeBlocks: [],
      selectionActions: [],
      commands: [],
      noteModes: [],
      readerPanels: [],
    };
  if (!isObject(value)) throw new Error('"contributes" should be an object');
  const viewers = list(value.viewers, "contributes.viewers").map(
    (viewer, i) => {
      const field = `contributes.viewers[${i}]`;
      if (!isObject(viewer)) throw new Error(`"${field}" should be an object`);
      const extensions = list(viewer.extensions, `${field}.extensions`).map(
        (ext, j) => extension(ext, `${field}.extensions[${j}]`),
      );
      if (!extensions.length)
        throw new Error(`"${field}.extensions" should not be empty`);
      return {
        extensions,
        title: text(viewer.title, `${field}.title`),
        ...(viewer.page === undefined
          ? {}
          : { page: innerPath(viewer.page, `${field}.page`) }),
      };
    },
  );
  const views = list(value.views, "contributes.views").map((view, i) => {
    const field = `contributes.views[${i}]`;
    if (!isObject(view)) throw new Error(`"${field}" should be an object`);
    const id = text(view.id, `${field}.id`);
    if (!ID.test(id))
      throw new Error(
        `"${field}.id" should be lowercase letters, digits, . _ -`,
      );
    return {
      id,
      title: text(view.title, `${field}.title`),
      icon: optionalText(view.icon, `${field}.icon`),
      page:
        view.page === undefined
          ? undefined
          : innerPath(view.page, `${field}.page`),
    };
  });
  const codeBlocks = list(value.codeBlocks, "contributes.codeBlocks").map(
    (lang, i) => {
      const field = `contributes.codeBlocks[${i}]`;
      const name = text(lang, field).toLowerCase();
      if (!/^[a-z0-9_+-]+$/.test(name))
        throw new Error(`"${field}" should be a language name, like plantuml`);
      return name;
    },
  );
  const selectionActions = list(
    value.selectionActions,
    "contributes.selectionActions",
  ).map((action, i) => {
    const field = `contributes.selectionActions[${i}]`;
    if (!isObject(action)) throw new Error(`"${field}" should be an object`);
    const id = text(action.id, `${field}.id`);
    if (!ID.test(id))
      throw new Error(
        `"${field}.id" should be lowercase letters, digits, . _ -`,
      );
    const where =
      action.where === undefined
        ? ["reader", "editor"]
        : list(action.where, `${field}.where`);
    for (const place of where) {
      if (place !== "reader" && place !== "editor")
        throw new Error(`"${field}.where" should be "reader" or "editor"`);
    }
    return {
      id,
      title: text(action.title, `${field}.title`),
      where: [...new Set(where)] as SelectionPlace[],
    };
  });
  const commands = list(value.commands, "contributes.commands").map(
    (command, i) => {
      const field = `contributes.commands[${i}]`;
      if (!isObject(command)) throw new Error(`"${field}" should be an object`);
      const id = text(command.id, `${field}.id`);
      if (!ID.test(id))
        throw new Error(
          `"${field}.id" should be lowercase letters, digits, . _ -`,
        );
      return { id, title: text(command.title, `${field}.title`) };
    },
  );
  const noteModes = list(value.noteModes, "contributes.noteModes").map(
    (mode, i) => {
      const field = `contributes.noteModes[${i}]`;
      if (!isObject(mode)) throw new Error(`"${field}" should be an object`);
      const id = text(mode.id, `${field}.id`);
      if (!ID.test(id))
        throw new Error(
          `"${field}.id" should be lowercase letters, digits, . _ -`,
        );
      return {
        id,
        title: text(mode.title, `${field}.title`),
        page:
          mode.page === undefined
            ? undefined
            : innerPath(mode.page, `${field}.page`),
      };
    },
  );
  const readerPanels = list(value.readerPanels, "contributes.readerPanels").map(
    (panel, i) => {
      const field = `contributes.readerPanels[${i}]`;
      if (!isObject(panel)) throw new Error(`"${field}" should be an object`);
      const id = text(panel.id, `${field}.id`);
      if (!ID.test(id))
        throw new Error(
          `"${field}.id" should be lowercase letters, digits, . _ -`,
        );
      const placement = panel.placement ?? "overlay";
      if (placement !== "overlay" && placement !== "side")
        throw new Error(`"${field}.placement" should be "overlay" or "side"`);
      return {
        id,
        title: text(panel.title, `${field}.title`),
        placement: placement as "overlay" | "side",
        ...(panel.page === undefined
          ? {}
          : { page: innerPath(panel.page, `${field}.page`) }),
      };
    },
  );
  return {
    viewers,
    views,
    codeBlocks: [...new Set(codeBlocks)],
    selectionActions,
    commands,
    noteModes,
    readerPanels,
  };
}

/**
 * Checks a manifest and gives it with the defaults filled in. Throws an error
 * that says what is wrong, to show to the user.
 */
export function parseManifest(json: unknown): PluginManifest {
  const value = typeof json === "string" ? (JSON.parse(json) as unknown) : json;
  if (!isObject(value)) throw new Error("The manifest should be an object");
  if (isObsidianManifest(value)) return parseObsidianManifest(value);

  const id = text(value.id, "id");
  if (!ID.test(id))
    throw new Error('"id" should be lowercase letters, digits, . _ -');
  const version = text(value.version, "version");
  if (!VERSION.test(version)) throw new Error('"version" should be like 1.0.0');
  const minAppVersion = optionalText(value.minAppVersion, "minAppVersion");
  if (minAppVersion && !VERSION.test(minAppVersion))
    throw new Error('"minAppVersion" should be like 1.0.0');

  const mode = value.mode ?? "sandboxed";
  if (mode !== "sandboxed" && mode !== "trusted")
    throw new Error('"mode" should be "sandboxed" or "trusted"');

  const permissions = list(value.permissions, "permissions").map(
    (permission) => {
      if (!PERMISSIONS.includes(permission as Permission))
        throw new Error(`Unknown permission: ${String(permission)}`);
      return permission as Permission;
    },
  );

  return {
    id,
    name: text(value.name, "name"),
    version,
    minAppVersion,
    author: optionalText(value.author, "author"),
    description: optionalText(value.description, "description"),
    ...(value.icon === undefined
      ? {}
      : { icon: imagePath(value.icon, "icon") }),
    mode,
    permissions: [...new Set(permissions)],
    // a page in a frame, or the module of a trusted plugin
    main:
      value.main === undefined
        ? mode === "trusted"
          ? "main.js"
          : "index.html"
        : innerPath(value.main, "main"),
    contributes: parseContributes(value.contributes),
  };
}

/**
 * A manifest of an Obsidian plugin: it says `isDesktopOnly`, which ours
 * never do, and no `mode`. Its main.js is CommonJS, run by the layer of
 * src/plugins/obsidian.
 */
const isObsidianManifest = (value: Record<string, unknown>) =>
  "isDesktopOnly" in value && value.mode === undefined;

function parseObsidianManifest(value: Record<string, unknown>): PluginManifest {
  const id = text(value.id, "id");
  if (!ID.test(id))
    throw new Error('"id" should be lowercase letters, digits, . _ -');
  return {
    id,
    name: text(value.name, "name"),
    version: text(value.version, "version"),
    // the version of Obsidian it wants, not of mdSilo
    minAppVersion: undefined,
    author: optionalText(value.author, "author"),
    description: optionalText(value.description, "description"),
    mode: "trusted",
    compat: "obsidian",
    permissions: [],
    main: "main.js",
    contributes: parseContributes(undefined),
  };
}

/** Compares versions like `1.2.3`, by their numbers; what follows `-` or `+` is ignored. */
export function compareVersions(a: string, b: string): number {
  const numbers = (version: string) =>
    version.split(/[-+]/)[0].split(".").map(Number);
  const [x, y] = [numbers(a), numbers(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** Whether the plugin can run in this version of the app */
export const supportsApp = (manifest: PluginManifest, appVersion: string) =>
  !manifest.minAppVersion ||
  compareVersions(appVersion, manifest.minAppVersion) >= 0;
