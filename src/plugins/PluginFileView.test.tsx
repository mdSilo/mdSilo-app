import { invoke } from "@tauri-apps/api/core";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import SidebarNoteLink from "@/shell/sidebar/SidebarNoteLink";
import { mockInvoke, renderWithView } from "@/testUtils";
import { parseManifest } from "./manifest";
import {
  disablePlugin,
  enablePlugin,
  viewersOf,
  type InstalledPlugin,
} from "./registry";
import PluginFileView, { fileMethods } from "./PluginFileView";

const plugin = (id: string, extensions: string[]): InstalledPlugin => ({
  id,
  dir: `/data/${id}`,
  where: "device",
  hash: "",
  manifest: parseManifest({
    id,
    name: id.toUpperCase(),
    version: "1.0.0",
    permissions: ["file:read", "file:write"],
    contributes: { viewers: [{ extensions, title: "Table" }] },
  }),
});

const csv = plugin("csv", ["csv", "tsv"]);
const sheet = plugin("sheet", ["csv"]);

beforeEach(() => {
  store.setState({ installedPlugins: [csv, sheet], pluginStates: {} });
});

describe("viewersOf", () => {
  it("finds the enabled plugins for the extension", () => {
    expect(viewersOf("/n/a.csv")).toEqual([]);
    enablePlugin(csv);
    enablePlugin(sheet);
    expect(viewersOf("/n/a.CSV").map((v) => v.plugin.id)).toEqual([
      "csv",
      "sheet",
    ]);
    expect(viewersOf("C:\\n\\a.tsv").map((v) => v.plugin.id)).toEqual(["csv"]);
    disablePlugin("csv");
    expect(viewersOf("/n/a.csv").map((v) => v.plugin.id)).toEqual(["sheet"]);
    expect(viewersOf("/n/csv")).toEqual([]);
  });
});

describe("fileMethods", () => {
  it("reads and writes the file opened, only as text", async () => {
    let disk = "a,b";
    mockInvoke(invoke, {
      read_file: () => disk,
      write_file: ({ text }: Record<string, unknown>) => {
        disk = text as string;
        return true;
      },
    });
    const text = { current: null as string | null };
    const methods = fileMethods("/n/data.csv", text);
    expect(await methods["file.info"].handler(undefined)).toEqual({
      name: "data.csv",
      ext: "csv",
    });
    expect(await methods["file.read"].handler(undefined)).toBe("a,b");
    expect(text.current).toBe("a,b");
    expect(await methods["file.write"].handler({ text: "c,d" })).toBe(true);
    expect(invoke).toHaveBeenCalledWith("write_file", {
      filePath: "/n/data.csv",
      text: "c,d",
    });
    expect(text.current).toBe("c,d");
    await expect(methods["file.write"].handler({ text: 1 })).rejects.toThrow(
      "{ text: string }",
    );
    expect(methods["file.read"].permission).toBe("file:read");
    expect(methods["file.write"].permission).toBe("file:write");
  });

  it("reads and writes the file opened as bytes", async () => {
    let disk: Uint8Array = new Uint8Array([1, 2, 3]);
    mockInvoke(invoke, {
      read_file_bytes: () => disk.buffer,
      write_file_bytes: ({ data }: Record<string, unknown>) => {
        disk = data as Uint8Array;
        return true;
      },
    });
    const text = { current: null as string | Uint8Array | null };
    const methods = fileMethods("/n/a.sqlite", text);
    expect(await methods["file.readBytes"].handler(undefined)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(text.current).toEqual(new Uint8Array([1, 2, 3]));
    expect(
      await methods["file.writeBytes"].handler({ data: new Uint8Array([9]) }),
    ).toBe(true);
    expect(disk).toEqual(new Uint8Array([9]));
    expect(
      await methods["file.writeBytes"].handler({
        data: new Uint8Array([7]).buffer,
      }),
    ).toBe(true);
    await expect(
      methods["file.writeBytes"].handler({ data: [1, 2] }),
    ).rejects.toThrow("{ data: Uint8Array }");
    expect(methods["file.readBytes"].permission).toBe("file:read");
    expect(methods["file.writeBytes"].permission).toBe("file:write");
  });

  it("says when the file can not be written", async () => {
    mockInvoke(invoke, { write_file: false });
    const methods = fileMethods("/n/data.csv", { current: null });
    await expect(methods["file.write"].handler({ text: "x" })).rejects.toThrow(
      "Could not write data.csv",
    );
  });
});

const ViewProbe = () => {
  const { state } = useCurrentViewContext();
  return <p data-testid="view">{JSON.stringify(state)}</p>;
};

const OpenFile = ({ path }: { path: string }) => {
  const { state, dispatch } = useCurrentViewContext();
  if (state.view !== "plugin-file") {
    return (
      <button
        onClick={() => dispatch({ view: "plugin-file", plugin: "csv", path })}
      >
        open
      </button>
    );
  }
  return <PluginFileView />;
};

const node = (id: string) => ({
  id,
  title: id.split("/").pop()!,
  created_at: "",
  updated_at: "",
  is_dir: false,
  children: [],
  collapsed: true,
});

describe("opening a file with a plugin", () => {
  it("opens a file from the sidebar in its plugin", async () => {
    enablePlugin(csv);
    renderWithView(
      <>
        <SidebarNoteLink node={node("/n/data.csv")} />
        <ViewProbe />
      </>,
    );
    await userEvent.click(screen.getByText("data.csv"));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject(
        { view: "plugin-file", pluginId: "csv", filePath: "/n/data.csv" },
      ),
    );
    expect(invoke).not.toHaveBeenCalledWith("open_url", expect.anything());
  });

  it("opens the file with the system when no plugin views it", async () => {
    renderWithView(<SidebarNoteLink node={node("/n/data.csv")} />);
    await userEvent.click(screen.getByText("data.csv"));
    expect(invoke).toHaveBeenCalledWith("open_url", { url: "/n/data.csv" });
  });

  it("shows the file in the frame of the plugin", async () => {
    enablePlugin(csv);
    renderWithView(<OpenFile path="/n/data.csv" />);
    await userEvent.click(screen.getByText("open"));
    expect(screen.getByText("data.csv")).toBeInTheDocument();
    expect(screen.getByTitle("CSV").getAttribute("sandbox")).toBe(
      "allow-scripts",
    );
  });

  it("says when the plugin is gone", async () => {
    store.setState({ installedPlugins: [] });
    renderWithView(<OpenFile path="/n/data.csv" />);
    await userEvent.click(screen.getByText("open"));
    expect(
      screen.getByText("The plugin csv is not installed."),
    ).toBeInTheDocument();
  });
});
