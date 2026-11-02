import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { parseManifest } from "@/plugins/manifest";
import { enablePlugin, type InstalledPlugin } from "@/plugins/registry";
import { mockInvoke, resetStore } from "@/testUtils";
import {
  cachedRenderers,
  readRenderCache,
  RENDER_CACHE_FILE,
  writeRenderCache,
} from "./renderCache";

const WS = "/ws";
const uml: InstalledPlugin = {
  id: "uml",
  dir: "/data/uml",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "uml",
    name: "UML",
    version: "1.0.0",
    contributes: { codeBlocks: ["plantuml"] },
  }),
};

/** A build: the cache read, the code drawn, the cache written. */
let file = "";
async function build(
  draw: (code: string) => Promise<string>,
  codes: string[],
  theme: "light" | "dark" = "light",
) {
  const cache = await readRenderCache(WS);
  const renderers = cachedRenderers(
    { mermaid: draw, plantuml: draw },
    cache,
    theme,
  );
  const out = [];
  for (const [lang, code] of codes.map((c) => c.split(":"))) {
    out.push(await renderers[lang]!(code).catch(() => "failed"));
  }
  await writeRenderCache(WS, cache);
  return out;
}

beforeEach(() => {
  resetStore();
  file = "";
  mockInvoke(invoke, {
    read_file: ({ filePath }: Record<string, unknown>) =>
      String(filePath).endsWith(RENDER_CACHE_FILE) ? file : "",
    write_file: ({ text }: Record<string, unknown>) => {
      file = String(text);
    },
    create_dir_recursive: undefined,
  });
});

test("a diagram not changed is not drawn again; only those of the last build kept", async () => {
  const draw = vi.fn(async (code: string) => `<svg>${code}</svg>`);
  expect(await build(draw, ["mermaid:a", "mermaid:b"])).toEqual([
    "<svg>a</svg>",
    "<svg>b</svg>",
  ]);
  expect(draw).toHaveBeenCalledTimes(2);

  draw.mockClear();
  expect(await build(draw, ["mermaid:a", "mermaid:c"])).toEqual([
    "<svg>a</svg>",
    "<svg>c</svg>",
  ]);
  expect(draw.mock.calls).toEqual([["c"]]);
  // b dropped
  expect(Object.values(JSON.parse(file))).toEqual([
    "<svg>a</svg>",
    "<svg>c</svg>",
  ]);

  // another theme: drawn
  draw.mockClear();
  await build(draw, ["mermaid:a"], "dark");
  expect(draw.mock.calls).toEqual([["a"]]);
});

test("a failure not kept; a plugin's by its version, not one in development", async () => {
  const failing = vi.fn(async () => {
    throw new Error("bad");
  });
  expect(await build(failing, ["mermaid:x"])).toEqual(["failed"]);
  expect(JSON.parse(file)).toEqual({});

  store.setState({ installedPlugins: [uml], pluginStates: {} });
  enablePlugin(uml);
  const draw = vi.fn(async (code: string) => `<svg>${code}</svg>`);
  await build(draw, ["plantuml:p"]);
  await build(draw, ["plantuml:p"]);
  expect(draw).toHaveBeenCalledTimes(1);

  // another version: drawn again
  store.setState({
    installedPlugins: [
      { ...uml, manifest: { ...uml.manifest!, version: "1.1.0" } },
    ],
  });
  await build(draw, ["plantuml:p"]);
  expect(draw).toHaveBeenCalledTimes(2);

  // in development: always drawn
  store.setState((s) => ({
    pluginStates: {
      ...s.pluginStates,
      uml: { ...s.pluginStates.uml, devSource: "/src/uml" },
    },
  }));
  await build(draw, ["plantuml:p"]);
  await build(draw, ["plantuml:p"]);
  expect(draw).toHaveBeenCalledTimes(4);
});
