import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import {
  fileNameOf,
  importSharedBook,
  readLinkOf,
  repoFileUrl,
  sharedBookOf,
} from "./sharedBook";
import { SharedBookPrompt } from "./SharedBookPrompt";

const dispatch = vi.fn();
vi.mock("@/state/useCurrentView", () => ({
  useCurrentViewContext: () => ({ state: { view: "default" }, dispatch }),
}));

const FILE =
  "https://raw.githubusercontent.com/me/notes/main/reading/Le%20Petit%20Prince.epub";
const CFI = "epubcfi(/6/8!/4/2,/1:0,/1:5)";

describe("the link of a shared book", () => {
  it("is read back as it was made", () => {
    const link = readLinkOf(FILE, CFI);
    expect(link.startsWith("https://mdsilo.github.io/mdSilo-app/?read=")).toBe(
      true,
    );
    expect(sharedBookOf(new URL(link).search)).toEqual({ url: FILE, cfi: CFI });
    expect(sharedBookOf(new URL(readLinkOf(FILE)).search)).toEqual({
      url: FILE,
    });
  });

  it("takes a book over https only, and a CFI only", () => {
    const of = (read: string, cfi?: string) =>
      sharedBookOf(
        `?${new URLSearchParams({ read, ...(cfi ? { cfi } : {}) })}`,
      );
    expect(of("http://x.org/a.epub")).toBeUndefined();
    expect(of("javascript:alert(1)//a.epub")).toBeUndefined();
    expect(of("https://x.org/page.html")).toBeUndefined();
    expect(of("not a url")).toBeUndefined();
    expect(of("https://x.org/a.epub", "javascript:1")).toEqual({
      url: "https://x.org/a.epub",
    });
    expect(sharedBookOf("?book=a.epub&ws=/w")).toBeUndefined();
  });

  it("names the file by the URL, decoded, without folders", () => {
    expect(fileNameOf(FILE)).toBe("Le Petit Prince.epub");
    expect(fileNameOf("https://x.org/a/%2E%2E%2Fb%3A.epub")).toBe("b.epub");
    expect(fileNameOf("https://x.org/")).toBe("book");
  });
});

describe("repoFileUrl", () => {
  const path = "reading/Le Petit Prince.epub";

  it("knows GitHub, GitLab and Gitea", () => {
    expect(repoFileUrl("https://github.com/me/notes.git", "main", path)).toBe(
      FILE,
    );
    expect(repoFileUrl("https://gitlab.com/me/notes", "dev", path)).toBe(
      "https://gitlab.com/me/notes/-/raw/dev/reading/Le%20Petit%20Prince.epub",
    );
    expect(repoFileUrl("https://codeberg.org/me/notes.git", "main", path)).toBe(
      "https://codeberg.org/me/notes/raw/branch/main/reading/Le%20Petit%20Prince.epub",
    );
  });

  it("leaves out credentials, and other hosts", () => {
    expect(
      repoFileUrl("https://me:secret@github.com/me/notes.git", "main", path),
    ).toBe(FILE);
    expect(repoFileUrl("https://git.example.org/me/notes", "main", path)).toBe(
      undefined,
    );
    expect(repoFileUrl("git@github.com:me/notes.git", "main", path)).toBe(
      undefined,
    );
    expect(repoFileUrl("https://github.com/me", "main", path)).toBe(undefined);
  });
});

describe("opening a shared book", () => {
  const search = `?${new URLSearchParams({ read: FILE, cfi: CFI })}`;
  const written: string[] = [];

  beforeEach(() => {
    written.length = 0;
    dispatch.mockReset();
    mockInvoke(invoke, {
      fetch_url: ({ url }: Record<string, unknown>) =>
        url === FILE ? new Uint8Array([1, 2, 3]) : undefined,
      file_exist: false,
      write_file_bytes: ({ filePath }: Record<string, unknown>) => {
        written.push(filePath as string);
        return true;
      },
    });
  });

  it("downloads the book into reading/", async () => {
    expect(await importSharedBook("/ws", { url: FILE })).toBe(
      "/ws/reading/Le Petit Prince.epub",
    );
    expect(written).toEqual(["/ws/reading/Le Petit Prince.epub"]);
  });

  it("asks, then opens the book at the place", async () => {
    store.setState({ initDir: "/ws" });
    render(<SharedBookPrompt search={search} />);
    expect(screen.getByText("Le Petit Prince.epub")).toBeInTheDocument();
    expect(screen.getByText(/raw\.githubusercontent\.com/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(dispatch).toHaveBeenCalledWith({
      view: "book",
      path: "/ws/reading/Le Petit Prince.epub",
      cfi: CFI,
    });
    expect(screen.queryByText("Le Petit Prince.epub")).toBeNull();
  });

  it("downloads nothing if cancelled; waits for the workspace", async () => {
    store.setState({ initDir: "" });
    const { rerender } = render(<SharedBookPrompt search={search} />);
    expect(screen.queryByText("Open a shared book?")).toBeNull();
    store.setState({ initDir: "/ws" });
    rerender(<SharedBookPrompt search={search} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    expect(written).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("shows why it can't", async () => {
    store.setState({ initDir: "/ws" });
    mockInvoke(invoke, {
      fetch_url: () => {
        throw new Error("404 Not Found");
      },
    });
    render(<SharedBookPrompt search={search} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("404 Not Found")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
