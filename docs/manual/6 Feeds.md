# Feeds

#manual#

Feeds are the other half of the input end: the news, blogs and podcasts you follow, read in the same place where you write. Open them with the RSS icon of the side menu (`Ctrl/Cmd + Shift + R`).

## Subscribing

Open **Manage Channels and Settings** at the bottom of the channel list, choose *add*, and enter the URL of a feed (RSS and Atom both work). The feed is loaded so you can check its title before saving. Use **Refresh All** to fetch every channel, or *Refresh Channel* in a channel. The channels are listed at the left, with the number of unread articles; the articles of the chosen channel are at the right, with **Mark All Read**.

:::info
**Web version.** Browsers block most feeds with CORS, so the web version fetches a feed directly first, then through a CORS proxy. You can set your own proxy in the settings of *Manage Channels*. See [[9 Reference|Reference]].
:::

## Reading

- Click an article to read it in the app. The article is cleaned of scripts before it is shown.
- Mark it **read** or **starred**. Starred articles are kept, and they have a channel of their own.
- Select text in an article, then use **Clip** to add the selection as a quote to the clip of the article.

## Clipping into your notes

The **Clip** button of an article saves it as a note in `reading/clips/` (title and source included), or, when you have selected some text, adds just that passage to the clip as a quote. Clips are ordinary notes: link them, tag them, search them.

## Podcasts

A feed with audio enclosures is a podcast. Play an episode from the built-in player. The **Playlist** (the fourth tab of the sidebar, `Mod + Shift + P`) lists the episodes of all your podcast channels, so you can keep listening while you write.

## Turn a channel into a book

The book button at the top of a channel (or of the Starred list) makes an **EPUB** of its articles: each article becomes a chapter, ordered by date. Articles that are only an excerpt are replaced by the full text of the original page when it can be fetched. The book goes into your Library, where you can read it with all the tools of the Reader, highlight it and link to it.

Press *Make* again later with the same name and the new articles are **appended** at the end; the existing chapters never move, so your highlights stay exactly where they were.

This is the bridge between *streams* and *books*: let a feed accumulate for a month, then read the month as a book, with notes.

## Sync

Subscriptions and starred articles are written to `.mdsilo/feeds.json` and merged when the workspace is opened, so your subscriptions follow your workspace across devices.

Next: [[7 Issues|Issues]].
