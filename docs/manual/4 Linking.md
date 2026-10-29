# Linking

#manual#

Links are what turn a folder of files into a knowledge base, and what connect reading, issues and writing. All links in mdSilo are **bidirectional**: when A links to B, B shows A.

## Wiki links

Type `[[` and start typing the title of a note; pick one from the list. If it does not exist, choose *Create a new doc*. A link with an alias reads `[[Philosophy|why it is built this way]]`.

Try it: here is a link to [[1 Philosophy|the philosophy]], and one back to the [[0 Start Here|start page]].

When you rename or move a note, the links to it are updated.

## Backlinks

Scroll to the bottom of a note and open **BackLinks**: you see every note that links here, with the sentence around the link. Open the backlinks of this note, and of [[1 Philosophy|Philosophy]], to see the chapters of the manual that point to them.

Notes that mention the title of this note without a link are listed as unlinked mentions, so you can link them with a click.

## Hashtags

Write `#idea#` (hash on both sides) anywhere in a note. The **Hashtag** tab of the sidebar lists all tags, and a click lists the notes that carry it. This whole manual is tagged #manual#.

The special tags `#todo#`, `#doing#` and `#done#` mark tasks, see [[7 Issues|Issues]].

## Links to books and highlights

Type `{{` to search your library: by title or author, and then by the quotes and notes of your highlights. Pick a book and you get a link like {{Alice's Adventures in Wonderland}}. Pick a highlight and the link opens the book **at that sentence**.

- Click such a link and the book opens in the Reader.
- Hand-written `{{Book title}}` and `{{Book title|alias}}` work too.
- On the book side, the Reader's **Links** tab lists every note and issue that points to the book.
- In the Reader, the toolbar over a selection copies **a quote with a link back** to the page, ready to paste into a note.

## Links to issues

Write `[@12](issue:12)` to link issue 12, or type `[[` and pick an issue from the list. The note then shows under **Referenced by issues** if the issue points back. In an issue, `[[Note title]]` links a note, and the issue sidebar lists its linked notes and books. See [[7 Issues|Issues]].

## Link types at a glance

| You type | It links to | Click opens |
|----------|-------------|-------------|
| `[[Note]]` | a note | the note |
| `[[Note\|alias]]` | a note, shown as alias | the note |
| `{{Book}}` | a book | the book in the Reader |
| `{{Book\|alias}}` | a book | the book |
| `[@12](issue:12)` | issue number 12 | the issue |
| `[text](https://...)` | the web | your browser |
| `#tag#` | a hashtag | the notes with the tag |

## Seeing the links

The links of the whole workspace are drawn in the Graph: notes, books and issues, with the lines between them. See [[8 Insight|Insight]]. The index is incremental, so even a workspace of tens of thousands of notes stays quick.

Next: [[5 Reader|Reader]].
