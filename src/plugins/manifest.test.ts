import { compareVersions, parseManifest, supportsApp } from "./manifest";

const minimal = { id: "csv-viewer", name: "CSV Viewer", version: "1.0.0" };

describe("parseManifest", () => {
  it("fills in the defaults", () => {
    expect(parseManifest(minimal)).toEqual({
      ...minimal,
      minAppVersion: undefined,
      author: undefined,
      description: undefined,
      mode: "sandboxed",
      permissions: [],
      main: "index.html",
      contributes: {
        viewers: [],
        views: [],
        codeBlocks: [],
        selectionActions: [],
        commands: [],
      },
    });
  });

  it("reads the JSON text of the file", () => {
    expect(parseManifest(JSON.stringify(minimal)).id).toBe("csv-viewer");
  });

  it("wants an id, a name and a version", () => {
    expect(() => parseManifest({ ...minimal, id: undefined })).toThrow('"id"');
    expect(() => parseManifest({ ...minimal, id: "My Plugin" })).toThrow(
      '"id"',
    );
    expect(() => parseManifest({ ...minimal, name: " " })).toThrow('"name"');
    expect(() => parseManifest({ ...minimal, version: "one" })).toThrow(
      '"version"',
    );
    expect(() => parseManifest([])).toThrow("object");
  });

  it("only knows two modes", () => {
    expect(parseManifest({ ...minimal, mode: "trusted" }).mode).toBe("trusted");
    expect(() => parseManifest({ ...minimal, mode: "root" })).toThrow('"mode"');
  });

  it("refuses unknown permissions and drops the repeated ones", () => {
    expect(
      parseManifest({
        ...minimal,
        permissions: ["file:read", "file:read", "net"],
      }).permissions,
    ).toEqual(["file:read", "net"]);
    expect(() => parseManifest({ ...minimal, permissions: ["shell"] })).toThrow(
      "Unknown permission: shell",
    );
  });

  it("keeps the page inside the plugin", () => {
    expect(parseManifest({ ...minimal, main: "./dist/view.html" }).main).toBe(
      "dist/view.html",
    );
    expect(() =>
      parseManifest({ ...minimal, main: "../other/index.html" }),
    ).toThrow('"main"');
    expect(() => parseManifest({ ...minimal, main: "/etc/passwd" })).toThrow(
      '"main"',
    );
    expect(() =>
      parseManifest({ ...minimal, main: "https://example.com/x.html" }),
    ).toThrow('"main"');
  });

  it("reads the viewers and the views", () => {
    const { contributes } = parseManifest({
      ...minimal,
      contributes: {
        viewers: [{ extensions: [".CSV", "tsv"], title: "Table" }],
        views: [
          {
            id: "stats",
            title: "Reading stats",
            icon: "chart",
            page: "./stats.html",
          },
        ],
      },
    });
    expect(contributes.viewers).toEqual([
      { extensions: ["csv", "tsv"], title: "Table" },
    ]);
    expect(contributes.views).toEqual([
      {
        id: "stats",
        title: "Reading stats",
        icon: "chart",
        page: "stats.html",
      },
    ]);
  });

  it("reads the languages of the code blocks it draws", () => {
    expect(
      parseManifest({
        ...minimal,
        contributes: { codeBlocks: ["PlantUML", "abc", "abc"] },
      }).contributes.codeBlocks,
    ).toEqual(["plantuml", "abc"]);
    expect(() =>
      parseManifest({ ...minimal, contributes: { codeBlocks: ["a b"] } }),
    ).toThrow('"contributes.codeBlocks[0]" should be a language name');
  });

  it("reads the actions on the text selected, in both places by default", () => {
    const { selectionActions } = parseManifest({
      ...minimal,
      contributes: {
        selectionActions: [
          { id: "explain", title: "Explain" },
          { id: "cite", title: "Cite", where: ["editor"] },
        ],
      },
    }).contributes;
    expect(selectionActions).toEqual([
      { id: "explain", title: "Explain", where: ["reader", "editor"] },
      { id: "cite", title: "Cite", where: ["editor"] },
    ]);
    expect(() =>
      parseManifest({
        ...minimal,
        contributes: {
          selectionActions: [{ id: "x", title: "X", where: ["web"] }],
        },
      }),
    ).toThrow(
      '"contributes.selectionActions[0].where" should be "reader" or "editor"',
    );
  });

  it("reads the commands", () => {
    expect(
      parseManifest({
        ...minimal,
        contributes: { commands: [{ id: "today", title: "Stats of today" }] },
      }).contributes.commands,
    ).toEqual([{ id: "today", title: "Stats of today" }]);
    expect(() =>
      parseManifest({
        ...minimal,
        contributes: { commands: [{ id: "A", title: "x" }] },
      }),
    ).toThrow("contributes.commands[0].id");
  });

  it("says which contribution is wrong", () => {
    expect(() =>
      parseManifest({
        ...minimal,
        contributes: { viewers: [{ extensions: [], title: "x" }] },
      }),
    ).toThrow('"contributes.viewers[0].extensions" should not be empty');
    expect(() =>
      parseManifest({
        ...minimal,
        contributes: { viewers: [{ extensions: ["c/v"], title: "x" }] },
      }),
    ).toThrow("contributes.viewers[0].extensions[0]");
    expect(() =>
      parseManifest({
        ...minimal,
        contributes: { views: [{ id: "A B", title: "x" }] },
      }),
    ).toThrow("contributes.views[0].id");
    expect(() =>
      parseManifest({
        ...minimal,
        contributes: { views: [{ id: "a", title: "x", page: "../x.html" }] },
      }),
    ).toThrow("contributes.views[0].page");
  });
});

describe("versions", () => {
  it("compares by numbers", () => {
    expect(compareVersions("0.10.0", "0.9.1")).toBe(1);
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta", "1.0.1")).toBe(-1);
  });

  it("checks the app version the plugin wants", () => {
    const manifest = parseManifest({ ...minimal, minAppVersion: "0.9.0" });
    expect(supportsApp(manifest, "0.8.0")).toBe(false);
    expect(supportsApp(manifest, "0.9.0")).toBe(true);
    expect(supportsApp(parseManifest(minimal), "0.1.0")).toBe(true);
  });
});

describe("the sample plugins", () => {
  it("have valid manifests", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(
      "examples/plugins/csv-viewer/manifest.json",
      "utf8",
    );
    expect(parseManifest(text).contributes.viewers[0].extensions).toEqual([
      "csv",
      "tsv",
    ]);
    const tags = readFileSync(
      "examples/plugins/tag-index/manifest.json",
      "utf8",
    );
    expect(parseManifest(tags).contributes.views[0].id).toBe("tags");
    const bars = readFileSync("examples/plugins/bars/manifest.json", "utf8");
    expect(parseManifest(bars).contributes.codeBlocks).toEqual(["bars"]);
    expect(parseManifest(bars).contributes.commands[0].id).toBe("help");
    const stats = readFileSync(
      "examples/plugins/text-stats/manifest.json",
      "utf8",
    );
    expect(parseManifest(stats).contributes.selectionActions[0].id).toBe(
      "count",
    );
  });
});
