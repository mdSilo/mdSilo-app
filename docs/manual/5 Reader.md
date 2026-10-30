# Reader

#manual#

The Reader is the input end of mdSilo. It opens books, lets you mark them up, and keeps the marks as ordinary notes that join the rest of your knowledge base.

Formats: **EPUB, PDF, MOBI, AZW/AZW3, FB2, CBZ** (comics). TXT, Markdown, HTML and ZIP files are converted to EPUB when imported; your original file is not touched.

## The Library

Open it with the books icon in the side menu (`Ctrl/Cmd + Shift + L`). It lists every book of the workspace.

- **Add books**: drag book files into the window, or use *Add books*. In the web version they are stored in your browser; on the desktop they are copied into `reading/`.
- **Add folder**: import all books of a folder and its subfolders, choosing the formats.
- **Grid or list**: the grid shows covers, the list shows author, series and description.
- **Search** with plain text or a regular expression: it matches title, author, format, group, status, series, subjects and description.
- **Groups**: drag a book onto a book to make a group, onto a group to move into it, onto the breadcrumbs to move up. Groups nest (`Fiction/Classics`). You can also group by author, series, format or status.
- **Status**: tag a book *Todo*, *Doing* or *Done*, or your own word.
- **Details**: open a book's card to read it, edit its metadata (title, author, series, language...), set its group and status, copy a link to it or open its notes.

Books are recognised by their content (a partial MD5 hash), so a renamed or moved book is still the same book, on every device.

:::info
**Sync, book by book.** Books can be large, so they are *not* synced with git by default. Each book and each group has a sync switch; the annotations and the reading progress are always synced. See [[9 Sync and Publish|Sync and Publish]].
:::

## Reading

Open a book and the page fills the window. The bars appear when you move the mouse to the top or bottom edge, or click the middle of the page.

- **Turn pages** by clicking the left or right part of the page, with the arrow keys, with the mouse wheel, or with the slider at the bottom. Clicking the middle shows or hides the bars.
- **Top bar**: back to the Library, contents and notes, bookmark, copy a link to this page, parallel reading, and *Font and layout*.
- **Bottom bar**: back and forward in your reading history, previous and next chapter, a progress slider, and the time left in the book.
- **Contents and notes** (the side panel): the table of contents, your annotations, the in-book search, and the **Links** tab.
- **Font and layout**: font, size, spacing, margins, page colour (follow the app, white, sepia, grey, dark), paging or scrolling, animation, which header and footer to show, image options and code highlighting.
- Click an **image** or a **table** in the page to zoom it. Footnotes open in a small popup instead of jumping away.
- Your place and the time you spend are saved per book. They feed the heat map in [[8 Insight|Insight]].

## Highlights and notes

Select text and a toolbar appears over it. It has:

| Action | What it does |
|--------|--------------|
| Copy | Copy the text |
| Highlight | Mark the text; choose style (highlight, underline, squiggly) and colour |
| Note | Write a note on the highlight, in Markdown |
| Search | Search the book for the selection |
| Dictionary | Look a word (or up to three) up in Wiktionary, add it to your vocabulary |
| Wikipedia | A summary of the selection |
| Translate | Translate into the language chosen in the settings |
| Read aloud | Speak from the selection |
| Copy quote | The text as a Markdown quote with a link back to the page |
| Copy link | A link to this place of the book |
| **New issue of it** | Make an issue from the selection, see [[7 Issues|Issues]] |

All your marks are written to a **Markdown file next to the book**: `Foo.epub` gets `Foo.epub.md`. It is a normal note with a heading per chapter, each highlight as a quote and your note below it. You can edit it, search it, link to it with `[[ ]]` and see it in the Graph.

```markdown
## Chapter I

<!-- mdsilo:note {"id":"…","cfi":"epubcfi(…)","color":"yellow"} -->
> Alice was beginning to get very tired of sitting by her sister on the bank

Opening line. The whole book is a dream about curiosity.
```

The comment keeps the position so that the highlight is drawn again on the page; the editor keeps it as it is. Clicking a highlight in the page shows its note and the issues linked to it.

## From the book to the rest of the workspace

- **Link to the book** from any note with `{{`. Link to a highlight to jump to the sentence. See [[4 Linking|Linking]].
- The **Links** tab of the side panel lists the notes and issues that point to this book: its backlinks.
- **New issue of it**: the quote and a link back become an issue. In the annotation list each highlight has the same button.
- The Graph shows the book as a node, joined to its annotation note and to every note that links to it.

Try it on {{Alice's Adventures in Wonderland}}: it is in your Library, with one highlight already made in chapter 1. Add your own, make an issue of it, then look at the Graph.

## Parallel reading

*Parallel reading* in the top bar opens a second book in a pane on the right. Each book turns pages on its own, and both can be highlighted and noted. Use it to compare a translation with the original, or a text with its commentary. The same book cannot be opened in both panes.

## Dictionary, vocabulary and translation

Double-click a word, or choose *Dictionary*. The popup shows the Wiktionary definitions (in the language of the book first). **Add to vocabulary** stores the word with its definition, the sentence it came from and a link to the book. The **Vocabulary** page (in the Library header) reviews them as flash cards, as a grid, or in bulk.

## Read aloud

The *Read aloud* button speaks the book from the selection or the page, highlighting the sentence as it goes, and moves on to the next chapter. The controls are in the player (the headphones of the side menu): pause, the previous or next paragraph, the speed, the engine and the voice. The voices offered are those of the language of the book.

The engines:

| Engine | |
|---|---|
| System | The speech of your computer: speech-dispatcher on Linux (`spd-say`), the voices of macOS, System.Speech on Windows. Used unless you choose another. |
| Piper | Natural voices, offline. Install [Piper](https://github.com/OHF-Voice/piper1-gpl), download voices (an `.onnx` file and its `.onnx.json` each) into a folder, and give the folder in the settings. |
| Azure Speech | Online, with your own key and region of an Azure Speech resource. |
| OpenAI or alike | Online, with your own key; the API URL, the model and the voices can be changed for a service or a server of your own with the same API (e.g. Kokoro). |
| Browser | The Web Speech API of the window, when it has voices. |

Set them up with the gear of the player. The keys are kept on this computer, in the app's data folder, never in the workspace. With the online engines, the text read is sent to the service. The audio made by Piper and the online engines is kept in the cache, so a sentence read again costs nothing; *Clear the audio made* removes it.

Next: [[6 Feeds|Feeds]].
