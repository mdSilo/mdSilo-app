use bytes::Bytes;
use chrono::offset::Local;
use reqwest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::command;

use crate::db;
use crate::models::{Article, Channel, NewArticle, NewChannel};
use crate::storage::do_log;

// # process rss or atom feed #
//
// process: rss or atom typed
pub async fn process_feed(
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  match process_rss(url, ty, title.clone()).await {
    Some(res) => Some(res),
    None => process_atom(url, ty, title).await,
  }
}

// 0- get content bytes
pub async fn get_feed_content(url: &str) -> Option<Bytes> {
  let client = reqwest::Client::builder().build();

  let response = match client {
    Ok(cl) => cl.get(url).send().await,
    Err(e) => {
      do_log(
        "Error".to_string(),
        format!("Err on [process_feed: reqwest {}]: {:?}", url, e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      );
      return None;
    }
  };

  match response {
    Ok(response) => match response.status() {
      reqwest::StatusCode::OK => {
        let content = match response.bytes().await {
          Ok(ctn) => ctn,
          Err(e) => {
            do_log(
              "Error".to_string(),
              format!("Err on [get_feed_content: process response bytes]: {:?}", e),
              format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
            );
            return None;
          }
        };

        Some(content)
      }
      _status => {
        do_log(
          "Error".to_string(),
          format!("Err on [get_feed_content], response status: {}", _status),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );

        None
      }
    },
    Err(e) => {
      do_log(
        "Error".to_string(),
        format!("Err on [get_feed_content: get response]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      );

      None
    }
  }
}

// 1.1 process rss
async fn process_rss(
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  if let Some(content) = get_feed_content(url).await {
    match rss::Channel::read_from(&content[..]).map(|channel| channel) {
      Ok(channel) => {
        let date = match &channel.pub_date {
          Some(t) => String::from(t),
          None => String::from(""),
        };
        let channel_title = match title {
          Some(t) if t.trim().len() > 0 => String::from(t.trim()),
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
            published: String::from(item.pub_date().clone().unwrap_or("")),
            content,
            author: String::from(item.author().clone().unwrap_or("")),
            image: String::from(""),
          };

          articles.push(new_article);
        }
        Some((rss_channel, articles))
      }
      Err(e) => {
        do_log(
          "Error".to_string(),
          format!("Err on [process_rss: read from content]: {:?}", e),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );
        None
      }
    }
  } else {
    None
  }
}

// 1.2- process atom
async fn process_atom(
  url: &str,
  ty: &str,
  title: Option<String>,
) -> Option<(NewChannel, Vec<NewArticle>)> {
  if let Some(content) = get_feed_content(url).await {
    match atom_syndication::Feed::read_from(&content[..]) {
      Ok(atom) => {
        let channel_title = match title {
          Some(t) if t.trim().len() > 0 => String::from(t.trim()),
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
      Err(e) => {
        do_log(
          "Error".to_string(),
          format!("Err on [process_atom: read from content]: {:?}", e),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );
        None
      }
    }
  } else {
    None
  }
}

// # end process rss or atom feed #

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

#[command]
pub async fn import_channels(url_list: Vec<String>) -> usize {
  let mut import_num = 0;
  for url in &url_list {
    let res = add_channel(url.to_string(), "rss".to_string(), None).await;
    import_num += res;
  }

  return import_num;
}

#[command]
pub async fn get_channels() -> Vec<Channel> {
  let results = db::get_channels();

  return results;
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
      let res = match process_feed(&channel.link, "rss", None).await {
        Some(r) => r,
        None => return 0,
      };
      let articles = res.1;

      let result = db::add_articles(String::from(&link), articles);

      result
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
  let result = record
    .into_iter()
    .map(|r| (r.feed_link.clone(), r.unread_count.clone()))
    .collect::<HashMap<String, i32>>();

  result
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
}
