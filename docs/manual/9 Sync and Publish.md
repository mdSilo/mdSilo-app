# Sync and Publish

#manual#

Your workspace is a folder of plain files, so it can live in a **git repository**, like code. mdSilo can sync that repository with GitHub, Gitea, GitLab or any git host, and turn chosen notes into a **static website** on GitHub Pages. Both are in the desktop app; the web version keeps your workspace in the browser, use **File Menu > Backup** there (see [[Reference]]).

## Sync with git

### Set it up once

1. Create an **empty, private repository** on your git host, e.g. `notes` on GitHub.
2. Create a **personal access token** that can write to it. On GitHub: *Settings > Developer settings > Fine-grained tokens*, give it access to that repository with **Contents: Read and write**.
3. In mdSilo, click **Sync** (the circling arrows at the bottom of the side menu, above the gear). Fill in:
   - **Repository URL**, the HTTPS address, e.g. `https://github.com/me/notes.git`;
   - **Token**;
   - **User name**, only if your host wants one with the token;
   - **Author** and **Email**, optional: the name on your commits. Empty, mdSilo uses your git settings, or *mdSilo*.
4. **Save**, then **Sync now**.

:::info
The token is kept in the app data of this device, **never in the workspace** and never in the repository, so it does not travel with your notes. Only HTTPS addresses work for now, not SSH (`git@...`).
:::

### What a sync does

A sync saves everything you changed as a commit, takes what the other devices sent, and sends yours: *commit, pull, push*, in one click. The dialog then says how many files came in, whether yours were sent, and when.

- **What is synced**: your notes, the annotations and reading progress of books, the vocabulary, issues, projects and feed subscriptions.
- **What is not**: `.mdsilo/local/` (the search index and caches of this device), and **book files**, unless you turn on sync for a book in the Library (see [[5 Reader|Reader]]). Turning it off later keeps the book on your other devices.
- **A new device**: open an empty folder, set up the same repository, and **Sync now**. Everything comes in. If the repository's main branch is `master` (or any other name), the new workspace follows it.

### Automatic sync

Below **Sync now**, **Automatic sync** can run it for you:

- **Every** 5, 15 or 30 minutes, or every hour;
- **When the app closes**, from the window or from Quit in the tray. The app waits for the sync, at most 30 seconds, then closes anyway.

Unsaved edits are saved before each sync. If a sync fails (no network, a wrong token), the Sync button shows a red dot; open it to read why.

### When both devices changed the same thing

Changes to different notes, or to different parts of one note, merge by themselves. When the same lines of a note were changed on both devices, **nothing is lost**:

- the note keeps the version from the remote;
- your version is saved beside it, as `Note (conflict 2026-10-29 1530).md`.

The dialog lists both; click to open them, keep what you want, delete the copy. The data of the app in `.mdsilo/` (library, vocabulary, issues) is merged field by field instead, so a book added on one device and a group changed on the other both stay.

## Publish a site

**File Menu > Publish** turns the notes you choose into a website: plain HTML pages with your links, the backlinks, a graph and a search, light and dark. Nothing has to be installed, and the site loads nothing from other servers.

### What goes public

You decide, and nothing is ticked at first:

- **Folders**: tick the folders whose notes are published. A folder brings its sub folders.
- One note can opt out with `publish: false` in its front matter, or opt in from any folder with `publish: true`:

```markdown
---
publish: false
---
```

- **With**: switch on what else the site shows: **Backlinks**, **Graph**, **Tag pages**, **Journals** (the daily notes, on the home page), **Book annotations** (the highlights and notes of your books, never the books) and **Issues** (with their timeline, milestones and project boards). For issues you can tick labels, e.g. `public`, to publish only the issues that carry one of them.
- **Draw**: **Math**, **Mermaid** and **ECharts** are drawn as you publish, so readers see formulas and diagrams without the site loading any library. Off, they show as their source.

:::warning
**A link to a note that is not published shows as plain text**: the reader sees its title, never its content. Comments (`<!-- -->`) and front matter are left out of every page. Still, read what you tick before publishing: a published site is public.
:::

The choices are kept in `.mdsilo/publish.json`, so every device publishes the same site.

### Publish to GitHub Pages

With sync set up, **Publish to GitHub Pages** builds the site and pushes it to the `gh-pages` branch of the same repository, with the same token. Your notes branch is not touched, and the site branch keeps only the latest version.

The first time, turn the site on in the repository: *Settings > Pages > Deploy from a branch > `gh-pages`*. The dialog shows the address, e.g. `https://me.github.io/notes/`; it can take a minute to appear.

:::tip
A private repository keeps your notes private, and the site public. GitHub Pages for a private repository needs a paid plan; otherwise publish from a public repository that holds only the site, or **Export to folder…** and put the folder anywhere that serves files.
:::

### Export to a folder

**Export to folder…** writes the same site into a folder you choose. Open its `index.html` in a browser to check it, or upload it to any static host (Netlify, Cloudflare Pages, Vercel, your own server).

Next: [[Reference]].
