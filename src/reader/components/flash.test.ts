import type { FoliateView } from "../view";
import { markQuote, useQuoteMark } from "../quoteMark";
import { flashPlace, markPlace, type Flash } from "./FoliateViewer";

// a view of one section, the page in the document of the test
const fakeView = (anchor: (doc: Document) => Range | Element | null) => {
  const view = {
    resolveNavigation: vi.fn(() => ({ index: 3, anchor })),
    renderer: { getContents: () => [{ doc: document, index: 3 }] },
    getCFI: vi.fn(
      (_index: number, range: Range) => `epubcfi(${range.toString()})`,
    ),
    addAnnotation: vi.fn(async () => undefined),
    deleteAnnotation: vi.fn(async () => undefined),
  };
  return view as typeof view & FoliateView;
};

const wordIn = (doc: Document, word: string) => {
  const text = doc.querySelector("p")!.firstChild as Text;
  const range = doc.createRange();
  const at = text.data.indexOf(word);
  range.setStart(text, at);
  range.setEnd(text, at + word.length);
  return range;
};

describe("the place gone to, marked for a moment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      "<p>It was a bright cold day in April. The clocks were striking thirteen.</p>";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the sentence of the word, then no more", async () => {
    const view = fakeView((doc) => wordIn(doc, "cold"));
    const flash: { current?: Flash } = {};
    await flashPlace(view, "epubcfi(/6/4!/4/2,/1:16,/1:20)", flash);
    const value = "foliate-note:epubcfi(It was a bright cold day in April.)";
    expect(view.addAnnotation).toHaveBeenCalledWith({ value });
    expect(flash.current?.value).toBe(value);
    vi.advanceTimersByTime(2000);
    expect(view.deleteAnnotation).toHaveBeenCalledWith({ value });
    expect(flash.current).toBeUndefined();
  });

  test("another place: the mark moves", async () => {
    const view = fakeView((doc) => wordIn(doc, "cold"));
    const flash: { current?: Flash } = {};
    await flashPlace(view, "epubcfi(/6/4!/4/2,/1:16,/1:20)", flash);
    view.resolveNavigation.mockReturnValue({
      index: 3,
      anchor: (doc) => wordIn(doc, "clocks"),
    });
    await flashPlace(view, "epubcfi(/6/4!/4/2,/1:39,/1:45)", flash);
    expect(view.deleteAnnotation).toHaveBeenCalledWith({
      value: "foliate-note:epubcfi(It was a bright cold day in April.)",
    });
    expect(flash.current?.value).toBe(
      "foliate-note:epubcfi(The clocks were striking thirteen.)",
    );
  });

  test("a place of a page, not of text: nothing marked", async () => {
    const collapsed = fakeView((doc) => {
      const range = doc.createRange();
      range.setStart(doc.querySelector("p")!.firstChild!, 0);
      return range;
    });
    const flash: { current?: Flash } = {};
    await flashPlace(collapsed, "epubcfi(/6/4!/4/2/1:0)", flash);
    // a section not shown
    const away = fakeView((doc) => wordIn(doc, "cold"));
    away.resolveNavigation.mockReturnValue({
      index: 9,
      anchor: (doc) => wordIn(doc, "cold"),
    });
    await flashPlace(away, "epubcfi(/6/20!/4/2,/1:16,/1:20)", flash);
    expect(collapsed.addAnnotation).not.toHaveBeenCalled();
    expect(away.addAnnotation).not.toHaveBeenCalled();
    expect(flash.current).toBeUndefined();
  });
});

describe("a text quoted, marked while the book is open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      "<p>It was a bright cold day in April. The clocks were striking thirteen.</p>";
  });
  afterEach(() => {
    vi.useRealTimers();
    markQuote(undefined);
  });

  test("the text itself, not the sentence, and it stays", async () => {
    const cfi = "epubcfi(/6/4!/4/2,/1:16,/1:20)";
    const view = fakeView((doc) => wordIn(doc, "cold"));
    const flash: { current?: Flash } = {};
    const quote: { current?: string } = {};
    markQuote(cfi);
    await markPlace(view, cfi, flash, quote);
    expect(view.addAnnotation).toHaveBeenCalledWith({
      value: `foliate-note:${cfi}`,
    });
    expect(quote.current).toBe(cfi);
    expect(flash.current).toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(view.deleteAnnotation).not.toHaveBeenCalled();
    // once: going there again flashes the sentence
    expect(useQuoteMark.getState().cfi).toBeUndefined();
  });

  test("another place gone to: the sentence for a moment, as before", async () => {
    const view = fakeView((doc) => wordIn(doc, "cold"));
    const flash: { current?: Flash } = {};
    const quote: { current?: string } = {};
    markQuote("epubcfi(/6/8!/4/2,/1:0,/1:5)");
    await markPlace(view, "epubcfi(/6/4!/4/2,/1:16,/1:20)", flash, quote);
    expect(quote.current).toBeUndefined();
    expect(flash.current?.value).toBe(
      "foliate-note:epubcfi(It was a bright cold day in April.)",
    );
  });
});
