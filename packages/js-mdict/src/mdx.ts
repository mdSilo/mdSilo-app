import { Mdict } from './mdict';
import { KeyInfoItem, KeyWordItem, MDictOptions } from './mdict-base';
import { BlobScanner, Scanner } from './scanner';
import common from './utils';

export interface FuzzyWord extends KeyWordItem {
  recordStartOffset: number;
  recordEndOffset: number;
  keyText: string;
  keyBlockIdx: number;
  ed: number;
}

type LookupResult = { keyText: string; definition: string | null };

export class MDX extends Mdict {
  // Reuse Mdict's flexible constructor: accepts either a path string (legacy
  // sync API, Node only) or a Scanner + name (the new async-friendly API).
  constructor(input: string | Scanner, nameOrOptions?: string | Partial<MDictOptions>, optionsArg?: Partial<MDictOptions>) {
    super(input as string | Scanner, nameOrOptions, optionsArg);
  }

  /**
   * Create and initialize an MDX from a Blob/File. Use this in browser/Tauri
   * code. The Blob can be a regular `File` from a file picker, a `NativeFile`
   * / `RemoteFile` from lazy file utils, or any other Blob subclass
   * that supports `slice(start, end).arrayBuffer()`. Slices are read on
   * demand, so large dictionaries don't need to be loaded into memory upfront.
   */
  static async create(file: Blob, options?: Partial<MDictOptions>): Promise<MDX> {
    const name = (file as File).name ?? 'unknown.mdx';
    const mdx = new MDX(new BlobScanner(file), name, options);
    await mdx.init();
    return mdx;
  }

  /**
   * Look up a word.
   *
   * Sync when the scanner is sync (legacy API: `new MDX(path).lookup(w).definition`
   * keeps working). When the scanner is async (e.g. {@link BlobScanner}), the
   * runtime return is `Promise<LookupResult>` — callers should `await`. TS
   * users on the async path see the public `LookupResult` overload, but
   * `await` always unwraps correctly.
   */
  lookup(word: string): LookupResult;
  lookup(word: string): LookupResult | Promise<LookupResult> {
    // Lazy init never populated keywordList — fall through to a per-block
    // decode rather than the empty eager binary search.
    if (this.options.lazy && this.keywordList.length === 0) {
      return this.lookupLazy(word);
    }
    const keyWordItem = this.lookupKeyBlockByWord(word);
    if (!keyWordItem) {
      return { keyText: word, definition: null };
    }
    const finish = (def: Uint8Array): LookupResult => {
      if (!def) return { keyText: word, definition: null };
      return { keyText: word, definition: this.meta.decoder.decode(def) };
    };
    const def = this.lookupRecordByKeyBlock(keyWordItem);
    return def instanceof Promise ? def.then(finish) : finish(def);
  }

  /**
   * Locate a single key without the full keywordList. Uses the per-block
   * envelope index (`keyInfoList`) to find which block could contain the
   * word, decodes just that block, then linearly scans for an exact match.
   * Robust against case/strip mismatches that would break a per-block
   * binary search.
   */
  async lookupKeyBlockByWordLazy(word: string): Promise<KeyWordItem | undefined> {
    const keyInfoId = this.lookupKeyInfoByWord(word);
    const tryBlock = async (i: number): Promise<KeyWordItem | undefined> => {
      const block = (await this.lookupPartialKeyBlockListByKeyInfoId(i)) as KeyWordItem[];
      return block.find((k) => this.comp(k.keyText, word) === 0);
    };
    if (keyInfoId >= 0) {
      const hit = await tryBlock(keyInfoId);
      if (hit) return hit;
    }
    // Fallback: some bundles have keyInfoList ordering that doesn't line up
    // with `comp` (e.g. case-folded or stripped). Scan blocks whose envelope
    // could contain `word` by a strip-normalised compare. Bounded by block
    // count (typically a few thousand); only the matching block is decoded.
    const stripped = this.strip(word);
    const list = this.keyInfoList as KeyInfoItem[];
    for (let i = 0; i < list.length; i++) {
      if (i === keyInfoId) continue;
      const info = list[i]!;
      if (this.strip(info.firstKey) <= stripped && stripped <= this.strip(info.lastKey)) {
        const hit = await tryBlock(i);
        if (hit) return hit;
      }
    }
    return undefined;
  }

  private async lookupLazy(word: string): Promise<LookupResult> {
    const item = await this.lookupKeyBlockByWordLazy(word);
    if (!item) return { keyText: word, definition: null };
    const def = await this.lookupRecordByKeyBlock(item);
    if (!def) return { keyText: word, definition: null };
    return { keyText: word, definition: this.meta.decoder.decode(def) };
  }

  /**
   * lookup all entries matching the word
   * useful when dictionary has duplicate keys (e.g., main entry + image + link)
   */
  lookupAll(word: string): LookupResult[];
  lookupAll(word: string): LookupResult[] | Promise<LookupResult[]> {
    const matchedItems = this.keywordList.filter(item => this.comp(item.keyText, word) === 0);
    const results = matchedItems.map((item) => {
      const def = this.lookupRecordByKeyBlock(item);
      const finish = (d: Uint8Array): LookupResult => ({
        keyText: item.keyText,
        definition: d ? this.meta.decoder.decode(d) : null,
      });
      return def instanceof Promise ? def.then(finish) : finish(def);
    });
    // If any element is a Promise, return Promise.all. Otherwise return sync array.
    if (results.some((r) => r instanceof Promise)) {
      return Promise.all(results);
    }
    return results as LookupResult[];
  }

  fetch(keywordItem: KeyWordItem): LookupResult;
  fetch(keywordItem: KeyWordItem): LookupResult | Promise<LookupResult> {
    const finish = (def: Uint8Array): LookupResult => {
      if (!def) return { keyText: keywordItem.keyText, definition: null };
      return { keyText: keywordItem.keyText, definition: this.meta.decoder.decode(def) };
    };
    const def = this.lookupRecordByKeyBlock(keywordItem);
    return def instanceof Promise ? def.then(finish) : finish(def);
  }

  /**
   * search the prefix like the phrase in the dictionary
   */
  prefix(prefix: string): KeyWordItem[] {
    const keywordList = this.associate(prefix);
    return keywordList.filter(item => item.keyText.startsWith(prefix));
  }

  /**
   * search matched list of associate words
   */
  associate(phrase: string): KeyWordItem[] {
    const keyBlockItem = this.lookupKeyBlockByWord(phrase, true);
    if (!keyBlockItem) return [];
    return this.keywordList.filter((keyword) => keyword.keyBlockIdx == keyBlockItem.keyBlockIdx);
  }

  /**
   * suggest the phrase with the edit distance
   */
  suggest(phrase: string, distance: number) {
    if (distance < 0 || distance > 5) {
      console.log('the edit distance should be in the range of 0 to 5');
      return [];
    }
    const keywordList = this.associate(phrase);
    const suggestList: KeyWordItem[] = [];
    keywordList.forEach(item => {
      const key = this.strip(item.keyText);
      const ed = common.levenshteinDistance(key, this.strip(phrase));
      if (ed <= distance) suggestList.push(item);
    });
    return suggestList;
  }

  fetch_definition(keywordItem: KeyWordItem): LookupResult;
  fetch_definition(keywordItem: KeyWordItem): LookupResult | Promise<LookupResult> {
    return this.fetch(keywordItem);
  }

  /**
   * fuzzy search words list
   */
  fuzzy_search(word: string, fuzzy_size: number, ed_gap: number): FuzzyWord[] {
    const fuzzy_words: FuzzyWord[] = [];
    const keywordList = this.associate(word);
    keywordList.forEach(item => {
      const key = this.strip(item.keyText);
      const ed = common.levenshteinDistance(key, this.strip(word));
      if (ed <= ed_gap) fuzzy_words.push({ ...item, ed });
    });
    fuzzy_words.sort((a, b) => a.ed - b.ed);
    return fuzzy_words.slice(0, fuzzy_size);
  }

  /**
   * search words that contain the specified substring
   */
  contains(substring: string, caseSensitive: boolean = false, limit: number = 1000): KeyWordItem[] {
    const searchKey = caseSensitive ? substring : substring.toLowerCase();
    const matchedList: KeyWordItem[] = [];
    for (const item of this.keywordList) {
      const keyText = caseSensitive ? item.keyText : item.keyText.toLowerCase();
      if (keyText.includes(searchKey)) {
        matchedList.push(item);
        if (matchedList.length >= limit) break;
      }
    }
    return matchedList;
  }
}
