import copy from "copy-to-clipboard";
import type MsEditor from "mdsmirror";
import { store } from "@/state/store";
import { setEditor } from "@/writer/editors";
import { quoteBeside } from "./actions";
import { useReaderStore } from "./readerStore";

vi.mock("copy-to-clipboard", () => ({ default: vi.fn() }));

const HASH = "0123456789abcdef0123456789abcdef";
const CFI = "epubcfi(/6/4!/4/2,/1:0,/1:5)";
const QUOTE = `> Alice\n>\n> — [Tiny Book](book:${HASH}#${encodeURIComponent(CFI)})`;

beforeEach(() => {
  useReaderStore.setState({
    hash: HASH,
    entry: { title: "Tiny Book" } as never,
  });
});

afterEach(() => {
  setEditor("/ws/Side.md", null);
  useReaderStore.reset();
});

describe("quoteBeside", () => {
  test("puts the quote, with its link back, in the editor of the note beside", () => {
    const insertMarkdown = vi.fn(() => true);
    setEditor("/ws/Side.md", { insertMarkdown } as unknown as MsEditor);
    store.setState({ besideNoteId: "/ws/Side.md" });
    expect(quoteBeside("Alice", CFI, useReaderStore)).toBe(true);
    expect(insertMarkdown).toHaveBeenCalledWith(QUOTE);
    expect(copy).not.toHaveBeenCalled();
  });

  test("no editor of it (the Markdown mode): copied to paste", () => {
    store.setState({ besideNoteId: "/ws/Side.md" });
    expect(quoteBeside("Alice", CFI, useReaderStore)).toBe(false);
    expect(copy).toHaveBeenCalledWith(QUOTE, { format: "text/plain" });
  });
});
