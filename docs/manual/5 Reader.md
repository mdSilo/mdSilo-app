# Reader

#manual#

The Reader is the input end of mdSilo. It opens books, lets you mark them up, and keeps the marks as ordinary notes that join the rest of your knowledge base.

Formats: **EPUB, PDF, MOBI, AZW/AZW3, FB2, CBZ** (comics). TXT, Markdown, HTML and ZIP files are converted to EPUB when imported; your original file is not touched.

## The Library

Open it with the books icon in the side menu (`Ctrl/Cmd + Shift + L`). It lists every book of the workspace.

- **Add books**: drag book files into the window, or use *Import*. In the web version they are stored in your browser; on the desktop they are copied into `reading/`.
- **Add folder**: import all books of a folder and its subfolders, choosing the formats.
- **Grid or list**: the grid shows covers, the list shows author, series and description.
- **Search** with plain text or a regular expression: it matches title, author, format, group, status, series, subjects and description.
- **Groups**: drag a book onto a book to make a group, onto a group to move into it, onto the breadcrumbs to move up. Groups nest (`Fiction/Classics`). You can also group by author, series, format or status.
- **Status**: tag a book *Todo*, *Doing* or *Done*, or your own word.
- **Details**: open a book's card to read it, edit its metadata (title, author, series, language...), set its group and status, rename its file, copy a link to it or open its notes.

Books are recognised by their content (a partial MD5 hash), so a renamed or moved book is still the same book, on every device. Its notes (`Foo.epub.md`) go with it, whether you rename it in the app, in the sidebar or in your file manager.

:::info
**Sync, book by book.** Books can be large, so they are *not* synced with git by default. Each book and each group has a sync switch; the annotations and the reading progress are always synced. See [[9 Sync and Publish|Sync and Publish]].
:::

## Reading

Open a book and the page fills the window. The bars appear when you move the mouse to the top or bottom edge, or click the middle of the page.

- **Turn pages** by clicking the left or right part of the page, with the arrow keys, with the mouse wheel, or with the slider at the bottom. Clicking the middle shows or hides the bars.
- **Top bar**: back to the Library, contents and notes, bookmark, parallel reading, and *Font and layout*.
- **Back to the book**: once you have read a book in a workspace, an open-book button in the side menu (`Ctrl/Cmd + Shift + B`) takes you back to it, at the page you left. In Settings, *View on Startup* → *Last Book* opens it when mdSilo starts.
- **A book in its own window** (desktop): in the Library's view menu, *Open books in* → *A new window*; or *Read in a new window* in a book's details. The window has the reader only: notes, issues and the Library open in the main window. Opening the book again brings its window to the front.
- **Bottom bar**: back and forward in your reading history, previous and next chapter, a progress slider, and the time left in the book.
- **Contents and notes** (the side panel): the table of contents, your annotations, the in-book search, and the **Links** tab.
- **Font and layout** (the numbers set with − and +): font, a font for CJK text (used for the characters the font has not, or where the book sets no font), size, spacing, the writing mode, columns, width, margins, page colour (follow the app, white, sepia, grey, dark), paging or scrolling, animation, which header and footer to show, clicking the sides to turn pages (or the left side to go forward), image options, code highlighting, the reading ruler, the word lens and translation.
- Click an **image** or a **table** in the page to zoom it. Footnotes open in a small popup instead of jumping away.
- **Reading ruler** (in *Font and layout*): a band over one to six lines, to keep your place. Drag it where you read; the keys that turn pages move it on by its lines first, and turn the page past the last lines. Its colour tints the text in it (or, with no colour, outlines it), and the opacity is yours.
- Your place and the time you spend are saved per book. They feed the heat map in [[8 Insight|Insight]].

### Writing mode: vertical books

Chinese, Japanese and Korean books are often set top to bottom. *Writing Mode* in *Font and layout* sets it for the book open (each book keeps its own): *As the book* (what the book says), *Horizontal*, *Vertical, right to left* (columns read from the right, as in a traditional Chinese book), *Vertical, left to right*, or *Horizontal, right to left*. Written right to left, the book goes forward to the left. *Double border* frames a vertical page with the double rule of an old printed book. With *Width* at its largest a line runs the full height of the page.

Try it with the TXT of a Chinese novel: drop it into the Library, where it becomes an EPUB with its chapters found by their headings (第一回, 第一章, Chapter 1…), open it and choose *Vertical, right to left*.

### Comics and PDFs

Books with fixed pages (PDF, CBZ comics, fixed-layout EPUB) have their own *Font and layout*:

- **Layout**: *Pages*, or a strip scrolled *Vertical* or *Horizontal*.
- **Zoom** with − and + (or `Ctrl/Cmd -`, `Ctrl/Cmd +`, `Ctrl/Cmd 0` to reset); **Fit** the page or the width.
- **Spread**: one page, or two side by side, with *Cover page alone* to keep the pairs of a printed book.
- **Webtoon (no gaps)**: a vertical strip without gaps between the pages, filling the width.
- **Lock horizontal panning**: a zoomed page moves only up and down.
- **Right-to-left pages**: for a manga, which a CBZ cannot say; kept for the book.

## Highlights and notes

Select text and a toolbar appears over it. It has:

| Action | What it does |
|--------|--------------|
| Copy | Copy the text |
| Highlight | Mark the text; choose style (highlight, underline, squiggly) and colour |
| Note | Write a note on the highlight, in Markdown |
| Search | Search the book for the selection |
| Dictionary | Look a word (or up to six) up in your dictionaries, Wikipedia one of them; hear it, add it to your vocabulary |
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

- **Change the range**: the selection and a highlight clicked have a handle at each end; drag them to take in more or less text.
- **Notes stay out of the way**: a highlight with a note gets a small note mark beside its line; the note shows when you point at the mark or click it.
## From the book to the rest of the workspace

- **Link to the book** from any note with `{{`. Link to a highlight to jump to the sentence. See [[4 Linking|Linking]].
- The **Links** tab of the side panel lists the notes and issues that point to this book: its backlinks.
- **New issue of it**: the quote and a link back become an issue. In the annotation list each highlight has the same button.
- The Graph shows the book as a node, joined to its annotation note and to every note that links to it.

Try it on {{Alice's Adventures in Wonderland}}: it is in your Library, with one highlight already made in chapter 1. Add your own, make an issue of it, then look at the Graph.

## Parallel reading

*Parallel reading* in the top bar opens a second book in a pane on the right. Each book turns pages on its own, and both can be highlighted and noted. Use it to compare a translation with the original, or a text with its commentary. The same book cannot be opened in both panes.

**Write beside the book.** The *Write beside* tab of the same menu opens a note in that pane instead: one written lately, any note found by its title, or a new one. Then:

- drag selected text from the page into the note: it lands as a quote with a link back to its place, below the paragraph you drop it on;
- or click *Quote in the note beside* on the selection toolbar (or on a highlight): the quote goes below the paragraph of the note's cursor, ready for your comment;
- an annotation in the *Notes* list can be dragged into the note too.

The book's own notes file (`Foo.epub.md`) is not offered: the reader writes it again on each highlight. The arrows in the pane's header (*Swap sides*) put the note or the second book on the left. From a note, the *Open beside* button (two columns, top right) has a *Read beside* tab: it opens a book with the note beside it. Not on a phone.

## Dictionary, vocabulary and translation

Double-click a word, or choose *Dictionary*. The popup has a tab for each dictionary turned on, in your order, and shows the first that has the word. The speaker buttons play its recordings (UK, US…) where the dictionary has them.

The dictionaries are set in **Settings → Dictionaries** (or the gear of the popup): turn each on or off and drag them into order.

| Dictionary | |
|---|---|
| Wiktionary | Most languages, the language of the book first; recordings of many words. On by default |
| Wikipedia | The summary of the article, in the language of the book; a search of it when there is none. On by default |
| Urban Dictionary | English slang |
| Merriam-Webster | Opens the site; with your API key (free for non-commercial use at dictionaryapi.com), looked up in the popup, with recordings |
| Google | Opens Google's definition |
| A site you add | Any dictionary on the web: a url with `%WORD%` where the word goes; opens in the browser. With an API key (optional, kept apart from the url and hidden), the url has `%KEY%` where it goes, and the word is looked up in the popup when the site answers as Merriam-Webster's APIs do (e.g. its Learner's or Medical dictionary at dictionaryapi.com: `https://www.dictionaryapi.com/api/v3/references/learners/json/%WORD%?key=%KEY%`); any other answer opens the link |
| A dictionary file | MDict (`.mdx`, with its `.mdd` of pictures and sounds, and `.css`), imported with **Import**; first in the list once imported |

Dictionary files are kept in the workspace (`.mdsilo/dictionaries/`) and are **not synced** unless you turn it on with the cloud button of the dictionary: they are often big. Another device sees the dictionary marked *Not here* until its files are synced to it. Links between entries look the other word up (the arrow goes back), and the speakers play the dictionary's sounds.

**Add to vocabulary** stores the word with its definition, its pronunciations, the dictionary, the sentence it came from and a link to the book (a word kept without pronunciations gets them the next time you look it up in a dictionary that has them). The **Vocabulary** page (in the Library header) reviews them as flash cards, as a grid, or in bulk; the speakers play a word, on either side of a card, and **P** plays the card shown.

**Word lens** (in *Font and layout*): the words of your vocabulary, met in a book, get a short meaning under them — their forms too (*rabbits*, *taking*), phrases (*take after*) and CJK words. Click one to look the word up. The gloss comes from the definition kept, or, with *Gloss: Translation*, is the word translated into the language chosen for translations (kept in the vocabulary, asked once). Write your own on the back of the word's card in the Vocabulary. *Gloss size* (of the text) and *Gloss color* (the accent of the page, gray, or a color, lighter on dark pages) set their look; the lines get room under them for a gloss of that size, added to your line height. Not for fixed layouts (PDF, comics).

In a dark theme, the colors a dictionary file gives its entries (made for a white page) are turned light where they would be hard to read.

**Translate.** *Translate* on a selection shows it in the language chosen (*Translate to* in *Font and layout*); the popup lets you change the service and the language. To read a whole book in translation, turn on *Translate the book* in *Font and layout*: the pages are translated as you read them, a paragraph's translation under it, or in its place with *Translation only*. Translations are kept, so a page read again is not sent again. *Make the translated book…* translates the rest (slowly, a few paragraphs at a time; stop it when you like, what was done is kept) and saves an EPUB beside the book, in the Library: `Foo.epub` gets `Foo.fr.epub`.

## Read aloud

The *Read aloud* button speaks the book from the selection or the page, highlighting the sentence as it goes, and moves on to the next chapter. The controls are in the player (the headphones of the side menu): pause, the previous or next paragraph, the speed, the engine and the voice. The voices offered are those of the language of the book.

The engines:

| Engine | |
|---|---|
| System | The speech of your computer: speech-dispatcher on Linux, the voices of macOS (AVSpeechSynthesizer, with the Enhanced and Premium voices you download in System Settings → Accessibility → Spoken Content), the voices of Windows (WinRT). Used unless you choose another. |
| System, by a program | macOS and Windows: the same by `say`, or by PowerShell with the older SAPI voices of Windows. |
| Piper | Natural voices, offline. Install [Piper](https://github.com/OHF-Voice/piper1-gpl), download voices (an `.onnx` file and its `.onnx.json` each) into a folder, and give the folder in the settings. |
| Azure Speech | Online, with your own key and region of an Azure Speech resource. |
| OpenAI or alike | Online, with your own key; the API URL, the model and the voices can be changed for a service or a server of your own with the same API (e.g. Kokoro). |
| Browser | The Web Speech API of the window, when it has voices. |

Set them up with the gear of the player. The keys are kept on this computer, in the app's data folder, never in the workspace. With the online engines, the text read is sent to the service. The audio made by Piper and the online engines is kept in the cache, so a sentence read again costs nothing; *Clear the audio made* removes it.

Next: [[6 Feeds|Feeds]].
