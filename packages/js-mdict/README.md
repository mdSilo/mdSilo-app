# js-mdict

[![npm version](https://badge.fury.io/js/js-mdict.svg)](https://badge.fury.io/js/js-mdict)
[![GitHub issues](https://img.shields.io/github/issues/terasum/js-mdict.svg)](https://github.com/terasum/js-mdict/issues)
[![GitHub forks](https://img.shields.io/github/forks/terasum/js-mdict.svg)](https://github.com/terasum/js-mdict/network)
[![GitHub stars](https://img.shields.io/github/stars/terasum/js-mdict.svg)](https://github.com/terasum/js-mdict/stargazers)
[![GitHub license](https://img.shields.io/github/license/terasum/js-mdict.svg)](https://github.com/terasum/js-mdict/blob/develop/LICENSE)

mdict (\*.mdd \*.mdx) file reader based on [jeka-kiselyov/mdict](https://github.com/jeka-kiselyov/mdict) .

Thanks to [fengdh](https://github.com/fengdh/mdict-js) and [jeka-kiselyov](https://github.com/jeka-kiselyov/mdict).

## Latest Version

v7.0.0 (2026-03-20)

## Licensing Transition Notice (v7.0.0)

As of **March 20, 2026**, `js-mdict` has transitioned from the MIT License to the **GNU AGPL-3.0**.

### Why this change?
1.  **Community Reciprocity**: To ensure that improvements made to the core parser—especially when used in network/cloud services—are shared back with the community.
2.  **Commercial Value Protection**: To provide a clear path for commercial licensing for entities that wish to use `js-mdict` in closed-source proprietary products.

### What this means for you:
*   **Open Source Users**: You can continue to use `js-mdict` for free under the terms of AGPL-3.0. If you modify the code and run it on a server, you must provide the source code of your version to your users.
*   **Commercial Users**: If you cannot comply with AGPL-3.0 (e.g., you want to use it in a closed-source app), please contact the maintainer for a **Commercial License**.
*   **Legacy Versions**: All versions prior to v7.0.0 remain under the MIT License.

---

## Usage

```bash
npm install js-mdict
```

### ESM

```javascript
import { MDX } from "js-mdict";

const mdict = new MDX("resources/oald7.mdx");

const def = mdict.lookup("ask");
console.log(def.definition);


/*
<head><link rel="stylesheet" type="text/css" href="O7.css"/></head><body><span class="hw"> ask </span hw><span class="i_g"> <img src="key.gif"/>  /<a class="i_phon" href="sound://aask_ggv_r1_oa013910.spx">ɑ:sk</a i_phon><span class="z">; </span z><i>NAmE</i> <a class="y_phon" href="sound://aask_ggx_r1_wpu01057.spx">æsk</a y_phon>​/ </span i_g><span class="cls"> verb</span cls><br><span class="sd">QUESTION<span class="chn"> 问题</span chn></span sd>
<div class="define"><span class="numb">1</span numb><span class="cf"> ~ <span class="bra">(</span bra>sb<span class="bra">)</span bra> <span class="bra">(</span bra>about sb/ sth<span class="bra">)</span bra> </span cf><span class="d">to say or write sth in the form of a question, in order to get information<span class="chn"> 问；询问</span chn></span d></div define>
<span class="phrase"><span class="pt">  [<span class="pt_inside">V <span class="pt_bold">speech</span></span><span>]</span> </span pt></span phrase>
<span class="sentence_eng">'Where are you going?' she asked. </span sentence_eng>
<span class="sentence_chi">"你去哪里？"她问道。</span sentence_chi>
<span class="phrase"><span class="pt"> [<span class="pt_inside">VN <span class="pt_bold">speech</span></span><span>]</span> </span pt></span phrase>
<span class="sentence_eng">'Are you sure?' he asked her. </span sentence_eng>
...
</body>
  */
import { MDD } from '../dist/cjs/index.js';

const mdx = new MDD('./tests/data/oale8.mdd');
console.log(mdx.locate('Logo.jpg')); // will auto normalize to '\\Logo.jpg'
console.log(mdx.locate('media/audio/test.mp3')); // will auto normalize to '\\media\\audio\\test.mp3'

/*
$ git clone github.com/terasum/js-mdict
$ cd js-mdict
$ npx tsx ./example/oale8-mdd-example.ts

NOTE: the mdd's definition is base64 encoded bytes, 
if your target is css/js content, please decode base64 and get the original text
if your target is images, you can use dataurl to show the images

{
  keyText: '\\Logo.jpg',
  definition: '/9j/4AAQSkZJRgABAgAAAQABAAD//gAEKgD/4gIcSUNDX1BST0ZJTEUAAQEAAAIMbGNtcwIQ...'
 }
*/


```

### CommonJS

```javascript
const { MDX } = require('js-mdict');

const mdict = new MDX('resources/oald7.mdx');

const def = mdict.lookup('ask');
console.log(def.definition);

/*
<head><link rel="stylesheet" type="text/css" href="O7.css"/></head><body><span class="hw"> ask </span hw><span class="i_g"> <img src="key.gif"/>  /<a class="i_phon" href="sound://aask_ggv_r1_oa013910.spx">ɑ:sk</a i_phon><span class="z">; </span z><i>NAmE</i> <a class="y_phon" href="sound://aask_ggx_r1_wpu01057.spx">æsk</a y_phon>​/ </span i_g><span class="cls"> verb</span cls><br><span class="sd">QUESTION<span class="chn"> 问题</span chn></span sd>
<div class="define"><span class="numb">1</span numb><span class="cf"> ~ <span class="bra">(</span bra>sb<span class="bra">)</span bra> <span class="bra">(</span bra>about sb/ sth<span class="bra">)</span bra> </span cf><span class="d">to say or write sth in the form of a question, in order to get information<span class="chn"> 问；询问</span chn></span d></div define>
<span class="phrase"><span class="pt">  [<span class="pt_inside">V <span class="pt_bold">speech</span></span><span>]</span> </span pt></span phrase>
<span class="sentence_eng">'Where are you going?' she asked. </span sentence_eng>
<span class="sentence_chi">"你去哪里？"她问道。</span sentence_chi>
<span class="phrase"><span class="pt"> [<span class="pt_inside">VN <span class="pt_bold">speech</span></span><span>]</span> </span pt></span phrase>
<span class="sentence_eng">'Are you sure?' he asked her. </span sentence_eng>
...
</body>
  */
```

### Command Line

``` bash
npm install -g js-mdict

> js-mdict ~/Downloads/uu89ug_folder/大辞泉202304.mdx 新語      
> <head><meta charset="utf-8"><link rel="stylesheet" type="text/css" href="srej.css"><script src="srej.js"></script></head><srejm class="srejm">☞<a href="entry://しんご【新語】">しんご【新語】</a><hr/>☞<a href="entry://しんご【新語】［書名］">しんご【新語】［書名］</a></srejm>

> js-mdict ~/Downloads/uu89ug_folder/大辞泉202304.mdd \\srej.css
> dGFibGUuc3JlansgbWFyZ2luOjAgYXV0bztib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7Ym9yZGVyLXN0eWxlOmhpZGRlbiB9DQp0...(total: 3976.97265625 KB)
```

## Benchmark

```angular2html
Mdict#loading time: 0 sec
Mdict#lookup x 20,288 ops/sec ±0.44% (93 runs sampled)
Mdict#prefix x 3,279 ops/sec ±17.69% (92 runs sampled)
Mdict#associate x 6,436 ops/sec ±0.40% (98 runs sampled)
Mdict#loadDict
average load time:0.0522899 s
Mdict#decodeRecordBlock
average decode time:0.19147 s
```
## Tested Passed Dictionaries

| File Path | Title | Version | Encoding | 'arose' Definition's Length |
| --------- | ----- | ------- | -------- | --------------------------- |
|dict-01-袖珍葡汉汉葡词典(简体版).mdx|Title (No HTML code allowed)|2.0|UTF-16|181|
|dict-02-红葡汉词典.mdx|Title (No HTML code allowed)|2.0|UTF-16|135|
|dict-03-ptDict_KeyCaseSensitive.mdx|Title (No HTML code allowed)|2.0|UTF-16|207|
|new-oxford-en-ch-dict.mdx|新牛津英汉双解大词典|2.0|UTF-8|285|
|oald7.mdx|Oxford Advanced Learner&apos;s Dictionary 7th|1.2|UTF-8|220|
|oale8.mdd|OALECD8e|2.0||1513|
|oale8.mdx||2.0|UTF-8|1549|
|Collins COBUILD Advanced Learner's English-Chinese Dictionary.mdd|柯林斯高阶英汉双解学习词典|2.0||13014|
|Collins COBUILD Advanced Learner's English-Chinese Dictionary.mdx|Collins COBUILD Advanced Learner&apos;s English-Chinese Dictionary|1.2|UTF-8|495|
|Oxford Advanced Learner's Dictionary 7th.mdd|O7|2.0||2295|
|Oxford Advanced Learner's Dictionary 7th.mdx|Oxford Advanced Learner&apos;s Dictionary 7th|1.2|UTF-8|220|
|The American Heritage Dictionary of English Language.mdd|undefined|1.2|undefined|1141|
|The American Heritage Dictionary of English Language.mdx|The American Heritage Dictionary of English Language|1.2|UTF-16|1823|
|Macmillan English Dictionary.mdd|Macmillan English Dictionary|2.0||44697|
|Macmillan English Dictionary.mdx|Macmillan English Dictionary|2.0|UTF-8|517|
|Oxford Collocations Dictionary for students of English 2nd.mdd|Oxford Collocations Dictionary for students of English|2.0||43791|
|Oxford Collocations Dictionary for students of English 2nd.mdx|Oxford Collocations Dictionary for students of English|2.0|UTF-8|386|
|Oxford Dictionary of English 2005 2nd.mdx|Oxford Dictionary of English|2.0|UTF-8|1081|
|Vocabulary.com Dictionary.mdd|Vocabulary.com Dictionary|2.0||145|
|Vocabulary.com Dictionary.mdx|Vocabulary.com Dictionary|2.0|UTF-8|2501|



## Release

### v6.0.6 (2025-01-06)
1. fix mdd not found case bug

### v6.0.5 (2025-01-04)
1. fix fuzzy_word search method

### v6.0.4 (2025-01-04)
1. add example

### v6.0.3 (2025-01-04)
1. fix tests and benchmarks

### v6.0.2

1. implements with TypeScript
2. fix some overflow bug
3. resort the keyword order internally (may cost more memory), search word precisely

BREAKING:
1. the `Mdict` class don't provide the `lookup` method now, you should use `MDX/MDD` class 

## MDX/MDD Layout
### v1.2-v2.0
![layout](./docs/mdict-format.svg)

> this is from [@ikey4u/wikit](https://github.com/ikey4u/wikit)

### v3.0
![layout-v3.0](./docs/mdict-v3.0-format.svg)

> this is from [xwang/mdict-analysis](https://bitbucket.org/xwang/mdict-analysis/src/master/MDict3.svg)

code by terasum with ❤️

---

## API Reference

### Search Methods

| Method | Description | Example |
|--------|-------------|---------|
| `lookup(word)` | Exact match search | `mdict.lookup("hello")` |
| `prefix(prefix)` | Find words starting with prefix | `mdict.prefix("book")` |
| `contains(substring, caseSensitive?, limit?)` | Find words containing substring | `mdict.contains("tion")` |
| `fuzzy_search(word, size, ed_gap)` | Fuzzy search with edit distance | `mdict.fuzzy_search("helo", 10, 2)` |
| `associate(phrase)` | Find words in same key block | `mdict.associate("book")` |
| `suggest(phrase, distance)` | Suggest similar words | `mdict.suggest("helo", 2)` |

### New in v7.0.0+

#### `contains()` - Substring Search

Search for all words containing a specified substring.

```javascript
import { MDX } from "js-mdict";

const mdict = new MDX("dictionary.mdx");

// Find all words containing "tion" (e.g., action, nation, education)
const results = mdict.contains("tion");
console.log(`Found ${results.length} words containing "tion"`);

// Case-sensitive search with limit (max 50 results)
const exactResults = mdict.contains("Book", true, 50);

// Get definitions for the found words
results.slice(0, 5).forEach(item => {
  const def = mdict.fetch(item);
  console.log(`${item.keyText}: ${def.definition?.substring(0, 50)}...`);
});
```

**Parameters:**
- `substring` (string): The text to search for
- `caseSensitive` (boolean, optional): Case-sensitive search. Default: `false`
- `limit` (number, optional): Maximum results to return. Default: `1000`

**Returns:** `KeyWordItem[]` - Array of matching keywords


### `lookupAll()` - Handle Duplicate Keys (New in v6.0.8+)

Some dictionaries may contain duplicate keys (e.g., main entry + image reference + link entry).
Use `lookupAll()` to retrieve all matching entries:

```javascript
import { MDX } from "js-mdict";

const mdict = new MDX("dictionary.mdx");

// Standard lookup returns only first match
const first = mdict.lookup("tyre");
console.log(first.definition); // May return image data, not main entry

// lookupAll returns ALL matching entries
const all = mdict.lookupAll("tyre");
console.log(`Found ${all.length} entries for "tyre":`);

// Filter to find main entry
const mainEntry = all.find(e => 
  !e.definition?.startsWith("[IMAGE") && 
  !e.definition?.startsWith("@@@LINK")
);
console.log(mainEntry.definition);
```

**When to use lookupAll():**
- Dictionary has duplicate keys
- Need to filter results (e.g., exclude resources/links)
- Want all possible definitions for a word


### `lookupAll()` - Find All Matching Entries

When a dictionary has duplicate keys (e.g., main entry + image + link), `lookup()` only returns the first match. Use `lookupAll()` to get all matches:

```javascript
import { MDX } from "js-mdict";

const mdict = new MDX("dictionary.mdx");

// Get all entries for "tyre" (main entry, image, link)
const allEntries = mdict.lookupAll("tyre");
console.log(`Found ${allEntries.length} entries for "tyre"`);

// Filter to get main entry (skip images and links)
const mainEntry = allEntries.find(e => {
  const def = e.definition || '';
  return !def.includes('[IMAGE]') && !def.includes('@@@LINK');
});

// Or filter by definition content
const withDefinitions = allEntries.filter(e => {
  const def = e.definition || '';
  return !def.includes('@@@LINK') && !def.startsWith('<');
});

// Get specific entry
allEntries.forEach((entry, index) => {
  console.log(`Entry ${index + 1}: ${entry.definition.substring(0, 50)}...`);
});
```

**Parameters:**
- `word` (string): The search word

**Returns:** `Array<{ keyText: string; definition: string | null }>` - All matching entries

---

_This method is useful for dictionaries with duplicate keys like LDOCE5+++ which may have multiple entries for the same word (main definition, image references, links to related words)._
