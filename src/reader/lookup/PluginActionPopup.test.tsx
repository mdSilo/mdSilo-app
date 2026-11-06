import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { store } from "@/state/store";
import { askPlugin } from "@/plugins/background";
import { parseManifest } from "@/plugins/manifest";
import { enablePlugin, type InstalledPlugin } from "@/plugins/registry";
import { activeStore, resetReaderStore } from "../readerStore";
import type { BookEntry } from "../library/library";
import { usePopups, type TextSelection } from "../popups";
import { isPopupShown } from "../popups";
import PluginActionPopup from "./PluginActionPopup";

vi.mock("@/plugins/background", () => ({ askPlugin: vi.fn() }));

const plugin: InstalledPlugin = {
  id: "ai",
  dir: "/data/ai",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "ai",
    name: "AI",
    version: "1.0.0",
    contributes: { selectionActions: [{ id: "explain", title: "Explain" }] },
  }),
};

const selection: TextSelection = {
  text: "entropy",
  cfi: "epubcfi(/6/4)",
  index: 1,
  box: { left: 10, top: 10, right: 60, bottom: 20 },
};

function renderPopup() {
  const root = document.createElement("div");
  root.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }) as DOMRect;
  const rootRef = createRef<HTMLDivElement>() as { current: HTMLDivElement };
  rootRef.current = root;
  return render(<PluginActionPopup rootRef={rootRef} />);
}

beforeEach(() => {
  store.setState({ installedPlugins: [plugin], pluginStates: {} });
  vi.mocked(askPlugin).mockReset();
  usePopups.getState().clear();
});

describe("PluginActionPopup", () => {
  it("shows what the plugin answers on the text selected", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue({
      html: "<p>A measure of <b>disorder</b></p><script>1</script>",
    });
    renderPopup();
    act(() =>
      usePopups
        .getState()
        .setPluginAction({
          plugin: "ai",
          action: "explain",
          title: "Explain",
          selection,
        }),
    );
    expect(screen.getByText("Explain")).toBeInTheDocument();
    expect(await screen.findByText("disorder")).toBeInTheDocument();
    expect(
      document.querySelector('[data-testid="plugin-action-popup"] script'),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Keep as a note/ }),
    ).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Close" }).click());
    expect(usePopups.getState().pluginAction).toBeUndefined();
    expect(screen.queryByTestId("plugin-action-popup")).toBeNull();
    expect(askPlugin).toHaveBeenCalledWith(
      plugin,
      "selection.action",
      expect.objectContaining({
        action: "explain",
        text: "entropy",
        where: "reader",
      }),
    );
  });

  it("shows the error of the plugin", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockRejectedValue(new Error("No network"));
    renderPopup();
    act(() =>
      usePopups
        .getState()
        .setPluginAction({
          plugin: "ai",
          action: "explain",
          title: "Explain",
          selection,
        }),
    );
    expect(await screen.findByText("No network")).toBeInTheDocument();
  });

  it("gives the book and the place selected to a plugin that may read books", async () => {
    const reader = {
      ...plugin,
      manifest: { ...plugin.manifest!, permissions: ["books:read" as const] },
    };
    store.setState({ installedPlugins: [reader] });
    enablePlugin(reader);
    resetReaderStore();
    activeStore().setState({
      path: "/ws/reading/Dune.epub",
      ws: "/ws",
      entry: {
        file: "reading/Dune.epub",
        title: "Dune",
        author: "Frank Herbert",
      } as BookEntry,
    });
    vi.mocked(askPlugin).mockResolvedValue("ok");
    renderPopup();
    act(() =>
      usePopups.getState().setPluginAction({
        plugin: "ai",
        action: "explain",
        title: "Explain",
        selection,
      }),
    );
    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(askPlugin).toHaveBeenCalledWith(
      reader,
      "selection.action",
      expect.objectContaining({
        text: "entropy",
        book: {
          path: "reading/Dune.epub",
          title: "Dune",
          author: "Frank Herbert",
          cfi: "epubcfi(/6/4)",
        },
      }),
    );
  });

  it("shows an image, with no note to keep", async () => {
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue({
      image: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      alt: "A card of entropy",
    });
    renderPopup();
    act(() =>
      usePopups.getState().setPluginAction({
        plugin: "ai",
        action: "explain",
        title: "Explain",
        selection,
      }),
    );
    expect(
      await screen.findByRole("img", { name: "A card of entropy" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Keep as a note/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Insert/ })).toBeNull();
  });

  it("runs nothing of a plugin not enabled", async () => {
    renderPopup();
    act(() =>
      usePopups
        .getState()
        .setPluginAction({
          plugin: "ai",
          action: "explain",
          title: "Explain",
          selection,
        }),
    );
    expect(
      await screen.findByText("The plugin is not enabled"),
    ).toBeInTheDocument();
    expect(askPlugin).not.toHaveBeenCalled();
  });

  it("counts as a popup shown, to close on a click in the book", () => {
    expect(isPopupShown(usePopups.getState())).toBe(false);
    usePopups
      .getState()
      .setPluginAction({
        plugin: "ai",
        action: "explain",
        title: "Explain",
        selection,
      });
    expect(isPopupShown(usePopups.getState())).toBe(true);
  });
});
