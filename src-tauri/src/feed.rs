use bytes::Bytes;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Duration;
use tauri::command;

use crate::db;
use crate::models::{Article, Channel, NewArticle, NewChannel};
use crate::storage::log_error;

// # process rss, atom or json feed #
//
// process: rss typed (rss, atom or json feed), podcast or opds
pub async fn process_feed(
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  if ty == "opds" {
    return process_opds(url, ty, title).await;
  }
  // fetched once, then read as each format in turn
  let content = get_feed_content(url).await?;
  let parsed = parse_feed(&content, url, ty, title);
  if parsed.is_none() {
    log_error(format!(
      "Err on [process_feed]: not an RSS, Atom or JSON feed: {url}"
    ));
  }
  parsed
}

/// The feed in the bytes: RSS, Atom or JSON Feed.
fn parse_feed(
  content: &[u8],
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  let start = content
    .iter()
    .position(|b| !b.is_ascii_whitespace() && !matches!(b, 0xEF | 0xBB | 0xBF));
  // a JSON Feed, after a BOM or spaces, which serde_json takes as not JSON
  if let Some(i) = start.filter(|&i| content[i] == b'{') {
    return parse_json_feed(&content[i..], url, ty, title);
  }
  parse_rss(content, url, ty, title.clone())
    .or_else(|| parse_atom(content, url, ty, title))
}

/// A client shared by the fetches: its connections kept and reused, no
/// new handshake for each page or image of a site.
static HTTP: LazyLock<reqwest::Result<reqwest::Client>> = LazyLock::new(|| {
  reqwest::Client::builder()
    .connect_timeout(Duration::from_secs(15))
    .pool_idle_timeout(Duration::from_secs(60))
    .build()
});

fn http() -> Result<&'static reqwest::Client, String> {
  HTTP.as_ref().map_err(|e| e.to_string())
}

/// The longest a feed takes to fetch.
const FEED_TIMEOUT: u64 = 60;

// 0- get content bytes
pub async fn get_feed_content(url: &str) -> Option<Bytes> {
  let response = match http() {
    Ok(cl) => {
      cl.get(url)
        .timeout(Duration::from_secs(FEED_TIMEOUT))
        .send()
        .await
    }
    Err(e) => {
      log_error(format!("Err on [process_feed: reqwest {}]: {:?}", url, e));
      return None;
    }
  };

  match response {
    Ok(response) => match response.status() {
      reqwest::StatusCode::OK => {
        let content = match response.bytes().await {
          Ok(ctn) => ctn,
          Err(e) => {
            log_error(format!(
              "Err on [get_feed_content: process response bytes]: {:?}",
              e
            ));
            return None;
          }
        };

        Some(content)
      }
      _status => {
        log_error(format!(
          "Err on [get_feed_content], response status: {}",
          _status
        ));

        None
      }
    },
    Err(e) => {
      log_error(format!("Err on [get_feed_content: get response]: {:?}", e));

      None
    }
  }
}

// 1.1 process rss
fn parse_rss(
  content: &[u8],
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  let channel = rss::Channel::read_from(content).ok()?;
  let date = match &channel.pub_date {
    Some(t) => String::from(t),
    None => String::from(""),
  };
  let channel_title = match title {
    Some(t) if !t.trim().is_empty() => String::from(t.trim()),
    _ => channel.title.to_string(),
  };
  let rss_channel = NewChannel {
    title: channel_title,
    link: url.to_string(),
    description: channel.description.to_string(),
    published: date,
    ty: ty.to_string(),
  };

  let mut articles: Vec<NewArticle> = Vec::new();
  for item in channel.items() {
    let title = item.title.clone().unwrap_or_else(|| String::from(""));
    let link = item.link.clone().unwrap_or_else(|| String::from(""));
    let description = item.description.clone().unwrap_or_default();
    let content = item.content.clone().unwrap_or_else(|| description.clone());
    // get audio
    let enclosure = item.enclosure.clone().unwrap_or_default();
    let audio_url = if enclosure.mime_type.starts_with("audio/") {
      enclosure.url
    } else {
      String::new()
    };

    let new_article = NewArticle {
      title,
      url: link,
      feed_link: url.to_string(),
      audio_url,
      description,
      published: String::from(item.pub_date().unwrap_or("")),
      content,
      author: String::from(item.author().unwrap_or("")),
      image: String::from(""),
    };

    articles.push(new_article);
  }
  Some((rss_channel, articles))
}

// 1.2- process atom
fn parse_atom(
  content: &[u8],
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  let atom = atom_syndication::Feed::read_from(content).ok()?;
  let channel_title = match title {
    Some(t) if !t.trim().is_empty() => String::from(t.trim()),
    _ => atom.title.to_string(),
  };
  let atom_channel = NewChannel {
    title: channel_title.clone(),
    link: url.to_string(),
    description: atom.subtitle.unwrap_or_default().to_string(),
    published: atom.updated.to_string(),
    ty: ty.to_string(),
  };

  let mut feeds: Vec<NewArticle> = vec![];
  for item in atom.entries {
    let item_url = if let Some(link) = item.links.first() {
      link.to_owned().href
    } else {
      String::new()
    };

    let description = item.summary.unwrap_or_default().to_string();

    let new_article = NewArticle {
      title: item.title.to_string(),
      url: item_url,
      feed_link: url.to_string(),
      audio_url: String::from(""),
      description: description.clone(),
      published: item.updated.to_rfc2822(),
      content: item
        .content
        .unwrap_or_default()
        .value
        .unwrap_or(description),
      author: String::from(""),
      image: String::from(""),
    };

    feeds.push(new_article);
  }
  Some((atom_channel, feeds))
}

// 1.3- process json feed, https://www.jsonfeed.org/version/1.1/ (and 1)
#[derive(Deserialize, Default)]
#[serde(default)]
struct JsonFeed {
  version: String,
  title: String,
  description: String,
  items: Vec<JsonFeedItem>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct JsonFeedItem {
  /// a string, mostly; a number in some
  id: serde_json::Value,
  url: Option<String>,
  external_url: Option<String>,
  title: Option<String>,
  content_html: Option<String>,
  content_text: Option<String>,
  summary: Option<String>,
  image: Option<String>,
  date_published: Option<String>,
  date_modified: Option<String>,
  /// of version 1
  author: Option<JsonFeedAuthor>,
  /// of version 1.1
  authors: Vec<JsonFeedAuthor>,
  attachments: Vec<JsonFeedAttachment>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct JsonFeedAuthor {
  name: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct JsonFeedAttachment {
  url: String,
  mime_type: String,
}

/// Plain text as HTML: escaped, its paragraphs (by blank lines) in `<p>`.
fn html_of_text(text: &str) -> String {
  text
    .split("\n\n")
    .map(str::trim)
    .filter(|p| !p.is_empty())
    .map(|p| {
      let escaped = p
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\n', "<br>");
      format!("<p>{escaped}</p>")
    })
    .collect()
}

/// A date of RFC 3339 as RSS gives it (RFC 2822), the same as of Atom; as it is if not one.
fn rfc2822_of(date: &str) -> String {
  chrono::DateTime::parse_from_rfc3339(date.trim())
    .map(|d| d.to_rfc2822())
    .unwrap_or_else(|_| date.to_string())
}

fn parse_json_feed(
  content: &[u8],
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  let feed: JsonFeed = serde_json::from_slice(content).ok()?;
  if !feed.version.starts_with("https://jsonfeed.org/version/") {
    return None;
  }
  let channel_title = match title {
    Some(t) if !t.trim().is_empty() => String::from(t.trim()),
    _ => feed.title,
  };

  let articles: Vec<NewArticle> = feed
    .items
    .into_iter()
    .map(|item| {
      let id_url = item
        .id
        .as_str()
        .filter(|id| id.starts_with("http://") || id.starts_with("https://"))
        .map(String::from);
      let link = item
        .url
        .or(item.external_url)
        .or(id_url)
        .unwrap_or_default();
      let description = item.summary.unwrap_or_default();
      let content = item
        .content_html
        .or_else(|| item.content_text.as_deref().map(html_of_text))
        .unwrap_or_else(|| description.clone());
      let author = item
        .authors
        .into_iter()
        .chain(item.author)
        .filter_map(|a| a.name)
        .collect::<Vec<_>>()
        .join(", ");
      let audio_url = item
        .attachments
        .into_iter()
        .find(|a| a.mime_type.starts_with("audio/"))
        .map(|a| a.url)
        .unwrap_or_default();
      let published = item
        .date_published
        .or(item.date_modified)
        .map(|d| rfc2822_of(&d))
        .unwrap_or_default();
      NewArticle {
        title: item.title.unwrap_or_default(),
        url: link,
        feed_link: url.to_string(),
        audio_url,
        description,
        published,
        content,
        author,
        image: item.image.unwrap_or_default(),
      }
    })
    .collect();

  // the newest of the articles, JSON Feed has no date of its own
  let published = articles
    .iter()
    .filter_map(|a| chrono::DateTime::parse_from_rfc2822(&a.published).ok())
    .max()
    .map(|d| d.to_rfc2822())
    .unwrap_or_default();
  let channel = NewChannel {
    title: channel_title,
    link: url.to_string(),
    description: feed.description,
    published,
    ty: ty.to_string(),
  };
  Some((channel, articles))
}

// 1.4- process opds: a catalog of books, OPDS 1 (atom) or 2 (json); its
// pages are browsed and its books downloaded in the app, see src/feed/opds.ts,
// so only the channel is stored, no articles
async fn process_opds(
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  let content = get_feed_content(url).await?;
  let channel = opds_channel(&content, url, ty, title)?;
  Some((channel, vec![]))
}

fn opds_channel(
  content: &[u8],
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<NewChannel> {
  let (catalog_title, description, published) =
    if let Ok(atom) = atom_syndication::Feed::read_from(content) {
      (
        atom.title.to_string(),
        atom.subtitle.unwrap_or_default().to_string(),
        atom.updated.to_string(),
      )
    } else if let Ok(json) = serde_json::from_slice::<serde_json::Value>(content) {
      let meta = json.get("metadata")?;
      let text = |key: &str| {
        meta
          .get(key)
          .and_then(|v| v.as_str())
          .unwrap_or_default()
          .to_string()
      };
      (text("title"), text("subtitle"), text("modified"))
    } else {
      log_error(format!("Err on [process_opds]: not an OPDS catalog: {url}"));
      return None;
    };
  let channel_title = match title {
    Some(t) if !t.trim().is_empty() => String::from(t.trim()),
    _ => catalog_title,
  };
  Some(NewChannel {
    title: channel_title,
    link: url.to_string(),
    description,
    published,
    ty: ty.to_string(),
  })
}

// # end process feed #

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedResult {
  pub channel: NewChannel,
  pub articles: Vec<NewArticle>,
}

#[command]
pub async fn fetch_feed(url: String) -> Option<FeedResult> {
  match process_feed(&url, "rss", None).await {
    Some(res) => {
      let channel = res.0;
      let articles = res.1;

      Some(FeedResult { channel, articles })
    }
    None => None,
  }
}

#[command]
pub async fn add_channel(url: String, ty: String, title: Option<String>) -> usize {
  let resp = process_feed(&url, &ty, title).await;
  // println!("add channel res: {:?}", res);

  match resp {
    Some(res) => {
      let channel = res.0;
      // the input feed url may not be same as fetched feed link
      // input feed url as the real rss url
      let articles = res.1;
      // println!("add articles: {:?}", articles.first());

      db::add_channel(channel, articles)
    }
    None => 0,
  }
}

/// The most bytes of a page or an image fetched by `fetch_url`.
const MAX_FETCH_BYTES: usize = 32 << 20;

/// A browser's: some sites send the full page only to browsers.
const PAGE_USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/// The most bytes of a file asked for, e.g. a book of an OPDS catalog.
const MAX_FILE_BYTES: usize = 1 << 30;

/// The bytes of a web page or an image (http, https), sent as binary: the
/// full text of an article and its images, for a book of a feed, see
/// src/feed/fullText.ts. Up to `max_bytes` if given: a book downloaded from
/// an OPDS catalog, see src/feed/opds.ts.
#[command]
pub async fn fetch_url(
  url: String,
  max_bytes: Option<usize>,
) -> Result<tauri::ipc::Response, String> {
  Ok(tauri::ipc::Response::new(
    fetch_bytes(&url, max_bytes).await?,
  ))
}

/// The bytes of an image of an article, for a book of a feed (see
/// src/feed/fullText.ts), made smaller if big (see book_images.rs): as a
/// page shows it, not as big as the site has it.
#[command]
pub async fn fetch_image(url: String) -> Result<tauri::ipc::Response, String> {
  let bytes = fetch_bytes(&url, None).await?;
  let bytes = tauri::async_runtime::spawn_blocking(move || {
    crate::book_images::shrink(&bytes, true).unwrap_or(bytes)
  })
  .await
  .map_err(|e| e.to_string())?;
  Ok(tauri::ipc::Response::new(bytes))
}

async fn fetch_bytes(
  url: &str,
  max_bytes: Option<usize>,
) -> Result<Vec<u8>, String> {
  let parsed = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
  if !matches!(parsed.scheme(), "http" | "https") {
    return Err(format!("not a web url: {url}"));
  }
  let max = max_bytes.map_or(MAX_FETCH_BYTES, |n| n.min(MAX_FILE_BYTES));
  // a big file takes its time
  let timeout = if max > MAX_FETCH_BYTES { 600 } else { 30 };
  let response = http()?
    .get(parsed)
    .header(reqwest::header::USER_AGENT, PAGE_USER_AGENT)
    .timeout(Duration::from_secs(timeout))
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !response.status().is_success() {
    return Err(format!("{url}: {}", response.status()));
  }
  if response.content_length().is_some_and(|n| n as usize > max) {
    return Err(format!("{url}: too big"));
  }
  let bytes = response.bytes().await.map_err(|e| e.to_string())?;
  if bytes.len() > max {
    return Err(format!("{url}: too big"));
  }
  Ok(bytes.to_vec())
}

/// Starred articles synced from another device, see src/feed/feedSync.ts
#[command]
pub fn add_starred_articles(articles: Vec<NewArticle>) -> usize {
  db::add_starred_articles(articles)
}

#[command]
pub async fn import_channels(url_list: Vec<String>) -> usize {
  let mut import_num = 0;
  for url in &url_list {
    let res = add_channel(url.to_string(), "rss".to_string(), None).await;
    import_num += res;
  }

  import_num
}

#[command]
pub async fn get_channels() -> Vec<Channel> {
  db::get_channels()
}

#[command]
pub fn delete_channel(link: String) -> usize {
  db::delete_channel(link)
}

#[command]
pub async fn add_articles_with_channel(link: String) -> usize {
  let channel = db::get_channel_by_link(link.clone());
  match channel {
    Some(channel) => {
      let res = match process_feed(&channel.link, &channel.ty, None).await {
        Some(r) => r,
        None => return 0,
      };
      let articles = res.1;

      db::add_articles(String::from(&link), articles)
    }
    None => 0,
  }
}

#[command]
pub fn get_articles(
  feed_link: Option<String>,
  read_status: Option<i32>,
  star_status: Option<i32>,
) -> Vec<Article> {
  db::get_articles(db::ArticleFilter {
    feed_link,
    read_status,
    star_status,
  })
}

#[command]
pub fn get_unread_num() -> HashMap<String, i32> {
  let record = db::get_unread_num();

  record
    .into_iter()
    .map(|r| (r.feed_link.clone(), r.unread_count))
    .collect::<HashMap<String, i32>>()
}

#[command]
pub fn get_article_by_url(url: String) -> Option<Article> {
  db::get_article_by_url(url)
}

#[command]
pub fn update_article_read_status(url: String, status: i32) -> usize {
  db::update_article_read_status(url, status)
}

#[command]
pub fn update_article_star_status(url: String, status: i32) -> usize {
  db::update_article_star_status(url, status)
}

#[command]
pub fn update_all_read_status(feed_link: String, read_status: i32) -> usize {
  db::update_articles_read_status(feed_link, read_status)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_delete_channel() {
    let url = "https://mdsilo.com";
    delete_channel(String::from(url));
  }

  #[test]
  fn test_get_unread_num() {
    get_unread_num();
  }

  #[test]
  fn test_opds_channel() {
    let atom = br#"<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:x</id><title>Books</title><updated>2026-01-01T00:00:00Z</updated>
  <entry><id>urn:a</id><title>A</title><updated>2026-01-01T00:00:00Z</updated></entry>
</feed>"#;
    let channel = opds_channel(atom, "https://x.org/opds", "opds", None).unwrap();
    assert_eq!(channel.title, "Books");
    assert_eq!(channel.ty, "opds");

    let json =
      br#"{"metadata": {"title": "Shelf"}, "links": [], "publications": []}"#;
    let channel = opds_channel(json, "https://x.org/opds2", "opds", None).unwrap();
    assert_eq!(channel.title, "Shelf");
    let titled =
      opds_channel(json, "https://x.org/opds2", "opds", Some(" Mine ".into()));
    assert_eq!(titled.unwrap().title, "Mine");

    assert!(opds_channel(b"<html></html>", "https://x.org", "opds", None).is_none());
  }

  #[test]
  fn test_parse_feed_formats() {
    let rss = br#"<?xml version="1.0"?><rss version="2.0"><channel><title>R</title>
<link>https://r.org</link><description>d</description>
<item><title>A</title><link>https://r.org/a</link></item></channel></rss>"#;
    let (channel, articles) =
      parse_feed(rss, "https://r.org/feed", "rss", None).unwrap();
    assert_eq!(channel.title, "R");
    assert_eq!(articles[0].url, "https://r.org/a");

    let atom = br#"<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:x</id><title>T</title><updated>2026-01-01T00:00:00Z</updated>
  <entry><id>urn:a</id><title>A</title><updated>2026-01-02T00:00:00Z</updated>
  <link href="https://t.org/a"/></entry>
</feed>"#;
    let (channel, articles) =
      parse_feed(atom, "https://t.org/feed", "rss", None).unwrap();
    assert_eq!(channel.title, "T");
    assert_eq!(articles[0].url, "https://t.org/a");

    assert!(parse_feed(b"<html></html>", "https://x.org", "rss", None).is_none());
    assert!(
      parse_feed(br#"{"title": "not a feed"}"#, "https://x.org", "rss", None)
        .is_none()
    );
  }

  #[test]
  fn test_parse_json_feed() {
    let json = "\u{feff}  ".to_string()
      + r#"{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "J",
  "description": "about",
  "items": [
    {"id": "1", "url": "https://j.org/1", "title": "One",
     "content_html": "<p>hi</p>", "summary": "s",
     "date_published": "2026-01-02T10:00:00+02:00",
     "authors": [{"name": "Ann"}, {"name": "Bo"}],
     "attachments": [{"url": "https://j.org/1.mp3", "mime_type": "audio/mpeg"}]},
    {"id": "https://j.org/2", "content_text": "a < b\nc\n\nd",
     "date_modified": "2026-01-03T00:00:00Z", "author": {"name": "Cy"}},
    {"id": 3, "external_url": "https://e.org/3", "summary": "only"}
  ]
}"#;
    let (channel, articles) =
      parse_feed(json.as_bytes(), "https://j.org/feed.json", "podcast", None)
        .unwrap();
    assert_eq!(channel.title, "J");
    assert_eq!(channel.description, "about");
    assert_eq!(channel.ty, "podcast");
    assert_eq!(channel.published, "Sat, 3 Jan 2026 00:00:00 +0000");
    assert_eq!(articles.len(), 3);

    let a = &articles[0];
    assert_eq!(a.url, "https://j.org/1");
    assert_eq!(a.content, "<p>hi</p>");
    assert_eq!(a.description, "s");
    assert_eq!(a.author, "Ann, Bo");
    assert_eq!(a.audio_url, "https://j.org/1.mp3");
    assert_eq!(a.published, "Fri, 2 Jan 2026 10:00:00 +0200");

    let b = &articles[1];
    assert_eq!(b.url, "https://j.org/2");
    assert_eq!(b.content, "<p>a &lt; b<br>c</p><p>d</p>");
    assert_eq!(b.author, "Cy");

    let c = &articles[2];
    assert_eq!(c.url, "https://e.org/3");
    assert_eq!(c.content, "only");
    assert_eq!(c.published, "");
  }
}
