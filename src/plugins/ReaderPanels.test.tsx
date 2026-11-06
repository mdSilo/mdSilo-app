import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store } from "@/state/store";
import { parseManifest } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";
import {
  ReaderPanelHost,
  ReaderPanelsButton,
  closeReaderPanel,
  useReaderPanel,
} from "./ReaderPanels";

const pluginWith = (
  id: string,
  panels: Record<string, unknown>[],
): InstalledPlugin => ({
  id,
  dir: `/data/${id}`,
  where: "device",
  hash: "",
  manifest: parseManifest({
    id,
    name: id.toUpperCase(),
    version: "1.0.0",
    permissions: ["reader:read"],
    contributes: { readerPanels: panels },
  }),
});

const rsvp = pluginWith("rsvp", [{ id: "read", title: "Speed reading" }]);
const notes = pluginWith("margin", [
  { id: "notes", title: "Margin notes", placement: "side" },
]);

// the list of panels shows in #app-container, as in the app
const renderReader = () =>
  render(
    <div id="app-container">
      <ReaderPanelsButton />
      <ReaderPanelHost />
    </div>,
  );

beforeEach(() => {
  closeReaderPanel();
  store.setState({ installedPlugins: [rsvp, notes], pluginStates: {} });
});

describe("panels of the reader", () => {
  it("nothing without an enabled plugin with a panel", () => {
    renderReader();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("one panel: a button that opens it over the book, and closes it", async () => {
    enablePlugin(rsvp);
    renderReader();
    const button = screen.getByRole("button", { name: "Speed reading" });
    await userEvent.click(button);
    const panel = screen.getByTestId("reader-panel");
    expect(panel.className).toContain("inset-0");
    expect(panel.querySelector("iframe")?.getAttribute("src")).toMatch(
      /rsvp\/index\.html\?v=\d+$/,
    );
    expect(
      screen.getByText("Speed reading", { selector: "span" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("reader-panel")).toBeNull();
    // again, then Escape
    await userEvent.click(button);
    fireEvent.keyDown(screen.getByTestId("reader-panel"), { key: "Escape" });
    expect(useReaderPanel.getState().open).toBeUndefined();
  });

  it("two panels: two buttons; one beside the book", async () => {
    enablePlugin(rsvp);
    enablePlugin(notes);
    renderReader();
    expect(screen.queryByRole("button", { name: /Plugin panels/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Margin notes" }));
    expect(useReaderPanel.getState().open).toEqual({
      plugin: "margin",
      panel: "notes",
    });
    expect(screen.getByTestId("reader-panel").className).toContain("w-80");
  });

  it("more panels: in a list, with their icons", async () => {
    const third = pluginWith("third", [{ id: "x", title: "Third panel" }]);
    store.setState({ installedPlugins: [rsvp, notes, third] });
    enablePlugin(rsvp);
    enablePlugin(notes);
    enablePlugin(third);
    renderReader();
    expect(screen.queryByRole("button", { name: "Speed reading" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Plugin panels/ }),
    );
    expect(await screen.findByText("Speed reading")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Third panel"));
    expect(useReaderPanel.getState().open).toEqual({
      plugin: "third",
      panel: "x",
    });
  });

  it("closes with the reader, and when its plugin is disabled", async () => {
    enablePlugin(rsvp);
    const { unmount } = renderReader();
    act(() =>
      useReaderPanel.setState({ open: { plugin: "rsvp", panel: "read" } }),
    );
    expect(screen.getByTestId("reader-panel")).toBeInTheDocument();
    await act(async () => store.setState({ pluginStates: {} }));
    expect(screen.queryByTestId("reader-panel")).toBeNull();
    unmount();
    expect(useReaderPanel.getState().open).toBeUndefined();
  });
});
