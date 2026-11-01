import { act, renderHook } from "@testing-library/react";
import { store } from "@/state/store";
import { codeBlockPlugins, renderCode, useCodeRenderers } from "./codeBlocks";
import { parseManifest } from "./manifest";
import { disablePlugin, enablePlugin, type InstalledPlugin } from "./registry";

const drawer = (id: string, codeBlocks: string[]): InstalledPlugin => ({
  id,
  dir: `/data/${id}`,
  manifest: parseManifest({
    id,
    name: id.toUpperCase(),
    version: "1.0.0",
    contributes: { codeBlocks },
  }),
});

const uml = drawer("uml", ["plantuml"]);
const other = drawer("other", ["plantuml", "abc"]);

const frameOf = (id: string) =>
  [...document.querySelectorAll("iframe")].find((f) =>
    f.src.includes(`/${id}/`),
  ) as HTMLIFrameElement | undefined;

/** the page of the plugin loads, and answers each request */
function answerWith(
  id: string,
  answer: (params: { lang: string; code: string; dark: boolean }) => unknown,
) {
  const frame = frameOf(id)!;
  frame.contentWindow!.postMessage = ((message: {
    request: number;
    params: never;
  }) => {
    const data = {
      mdsilo: 1,
      reply: message.request,
      result: answer(message.params),
    };
    window.dispatchEvent(
      new MessageEvent("message", { data, source: frame.contentWindow }),
    );
  }) as Window["postMessage"];
  frame.dispatchEvent(new Event("load"));
  return frame;
}

beforeEach(() => {
  store.setState({
    installedPlugins: [uml, other],
    pluginStates: {},
    darkMode: false,
  });
});

describe("codeBlockPlugins", () => {
  it("finds the enabled plugin of each language, the first one", () => {
    expect(codeBlockPlugins().size).toBe(0);
    enablePlugin(uml);
    enablePlugin(other);
    const byLang = codeBlockPlugins();
    expect(byLang.get("plantuml")).toBe(uml);
    expect(byLang.get("abc")).toBe(other);
  });
});

describe("renderCode", () => {
  it("asks the plugin in a hidden sandboxed frame, and sanitizes what it draws", async () => {
    enablePlugin(uml);
    const drawn = renderCode("PlantUML", "a -> b");
    const frame = answerWith(
      "uml",
      ({ lang, code, dark }) =>
        `<svg data-lang="${lang}" data-dark="${dark}"><script>alert(1)</script><text>${code}</text><style>body{}</style></svg>`,
    );
    const svg = await drawn;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.style.visibility).toBe("hidden");
    expect(svg).toContain('data-lang="plantuml"');
    expect(svg).toContain('data-dark="false"');
    expect(svg).toContain("a -&gt; b");
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("style");
  });

  it("keeps one frame for a plugin, closed when disabled", async () => {
    enablePlugin(uml);
    const first = renderCode("plantuml", "a");
    answerWith("uml", () => "<svg/>");
    await first;
    await renderCode("plantuml", "b");
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    disablePlugin("uml");
    expect(frameOf("uml")).toBeUndefined();
  });

  it("fails without a plugin, or without a picture", async () => {
    await expect(renderCode("plantuml", "a")).rejects.toThrow(
      "No plugin draws plantuml",
    );
    enablePlugin(uml);
    const drawn = renderCode("plantuml", "a");
    answerWith("uml", () => 42);
    await expect(drawn).rejects.toThrow("UML drew no SVG or HTML");
  });
});

describe("useCodeRenderers", () => {
  it("gives a renderer per language, and a new key when they change", async () => {
    const { result } = renderHook(() => useCodeRenderers());
    expect(result.current).toEqual({ codeRenderers: {}, key: "" });
    act(() => enablePlugin(other));
    expect(Object.keys(result.current.codeRenderers)).toEqual([
      "abc",
      "plantuml",
    ]);
    expect(result.current.key).toBe("abc,plantuml");
    const before = result.current;
    act(() => enablePlugin(uml));
    expect(result.current).toBe(before);

    const drawn = result.current.codeRenderers.abc("X:1", true);
    answerWith(
      "other",
      ({ lang, dark }) => `<svg data-lang="${lang}" data-dark="${dark}"/>`,
    );
    expect(await drawn).toContain('data-dark="true"');
  });
});
