import * as CFI from "foliate-js/epubcfi.js";
import type { VocabularyEntry } from "../vocabulary/vocabulary";
import {
  applyLens,
  baseForms,
  glossOf,
  glossOfDefinition,
  LENS_CLASS,
  lexiconOf,
  matchesIn,
  rangeOfMarker,
  removeLens,
  type LensWord,
} from "./lens";

const word = (w: string, gloss = `g-${w}`, id = w): LensWord => ({
  id,
  word: w,
  gloss,
});

const entry = (patch: Partial<VocabularyEntry>): VocabularyEntry => ({
  id: "e",
  word: "cold",
  definition: "",
  addedAt: "",
  ...patch,
});

describe("word lens: words", () => {
  test("the forms a word may be of", () => {
    expect(baseForms("Rabbits")).toContain("rabbit");
    expect(baseForms("stories")).toContain("story");
    expect(baseForms("boxes")).toContain("box");
    expect(baseForms("stopped")).toContain("stop");
    expect(baseForms("taking")).toContain("take");
    expect(baseForms("colder")).toContain("cold");
    expect(baseForms("happiest")).toContain("happy");
    expect(baseForms("Alice's")).toContain("alice");
    expect(baseForms("glass")).not.toContain("glas");
    expect(baseForms("cold")[0]).toBe("cold");
  });

  test("the gloss of a definition: its first meaning, short", () => {
    expect(
      glossOfDefinition(
        "<p><i>Adjective</i> Having a low temperature. Unfriendly.</p><p><i>Noun</i> A low temperature.</p>",
      ),
    ).toBe("Having a low temperature");
    // an example in quotes, a clause after a semicolon, left out
    expect(
      glossOfDefinition(
        "<p><i>noun</i> A small mammal; a hare. <i>“a rabbit ran”</i></p>",
      ),
    ).toBe("A small mammal");
    // an entry of a dictionary file: its headword left out
    expect(
      glossOfDefinition(
        "<p>take [took, taken, taking] be taken aback to be surprised</p>",
        "take",
      ),
    ).toBe("be taken aback to be surprised");
    expect(glossOfDefinition("")).toBe("");
  });

  test("the gloss of a word: as written, translated, of its definition", () => {
    const e = entry({
      definition: "<p><i>Adjective</i> Chilly.</p>",
      translations: { "zh-CN": "冷的" },
    });
    expect(glossOf(e)).toBe("Chilly");
    expect(glossOf(e, "zh-CN")).toBe("冷的");
    // not translated to that one: of the definition
    expect(glossOf(e, "fr")).toBe("Chilly");
    expect(glossOf({ ...e, gloss: " frosty " }, "zh-CN")).toBe("frosty");
  });

  test("met in a text: forms of words, phrases (the longest), CJK; not overlapping", () => {
    const lexicon = lexiconOf([
      word("take"),
      word("take after"),
      word("rabbit"),
      word("兔子"),
      word("empty", ""),
    ]);
    const text =
      "She takes after her mother; a Rabbit took two rabbits. 一只兔子。 Take after, empty.";
    const found = matchesIn(text, lexicon).map(
      (m) => `${text.slice(m.start, m.end)}=${m.entry.word}`,
    );
    expect(found).toEqual([
      "takes=take",
      "Rabbit=rabbit",
      "rabbits=rabbit",
      "兔子=兔子",
      "Take after=take after",
    ]);
    // a phrase as written only, between word boundaries
    expect(matchesIn("mistake aftermath", lexicon)).toEqual([]);
  });
});

describe("word lens: the pages", () => {
  const html = () =>
    new DOMParser().parseFromString(
      `<html><head></head><body><p id="a">It was a <i>bright</i> cold day, colder in April.</p>
      <p>Cold <code>cold</code> <span cfi-inert="">cold</span> <ruby>冷<rt>cold</rt></ruby></p></body></html>`,
      "text/html",
    );
  const lexicon = lexiconOf([word("cold", "chilly")]);

  test("markers before the words, glossed; the text as it was", () => {
    const doc = html();
    const text = doc.body.textContent;
    expect(applyLens(doc, lexicon)).toBe(3);
    const markers = [...doc.querySelectorAll<HTMLElement>(`.${LENS_CLASS}`)];
    expect(markers.map((m) => m.nextSibling?.textContent?.slice(0, 6))).toEqual(
      ["cold d", "colder", "Cold "],
    );
    expect(markers[0]).toMatchObject({
      dataset: { gloss: "chilly", lens: "cold", length: "4" },
    });
    expect(markers[0].hasAttribute("cfi-inert")).toBe(true);
    expect(markers[0].textContent).toBe("");
    // no text added: selected, copied, read aloud as before
    expect(doc.body.textContent).toBe(text);
    expect(rangeOfMarker(markers[1])?.toString()).toBe("colder");
    // again: as many, not more
    expect(applyLens(doc, lexicon)).toBe(3);
    removeLens(doc);
    expect(doc.querySelectorAll(`.${LENS_CLASS}`)).toHaveLength(0);
    expect(doc.body.textContent).toBe(text);
    expect(applyLens(doc, lexiconOf([]))).toBe(0);
  });

  test("the CFIs as without them; a range kept on the text (a highlight) stays", () => {
    const plain = html();
    const p = (doc: Document) => doc.getElementById("a")!;
    const rangeIn = (doc: Document) => {
      const r = doc.createRange();
      const after = p(doc).childNodes[2] as Text; // " cold day, colder in April."
      r.setStart(after, 1);
      r.setEnd(after, 16);
      return r;
    };
    const cfi = CFI.fromRange(rangeIn(plain));
    const doc = html();
    const kept = rangeIn(doc);
    const before = kept.toString();
    applyLens(doc, lexicon);
    // a live range across the words marked: its text the same
    expect(kept.toString()).toBe(before);
    expect(kept.toString()).toBe("cold day, colde");
    // the CFI of the plain page, on the page marked, and the other way
    expect(CFI.toRange(doc, CFI.parse(cfi)).toString()).toBe(before);
    expect(CFI.fromRange(kept)).toBe(cfi);
    const marked = rangeOfMarker(doc.querySelector(`.${LENS_CLASS}`)!)!;
    expect(
      CFI.toRange(plain, CFI.parse(CFI.fromRange(marked))).toString(),
    ).toBe("cold");
  });
});
