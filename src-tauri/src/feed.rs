use std::collections::HashMap;
use reqwest;
use serde::{Serialize, Deserialize};
use tauri::command;

use crate::db;
use crate::models::{Channel, NewChannel, NewArticle, Article};

// # process rss feed #
// todo: podcast's audio link
//
// 1- fetch: rss typed
pub async fn fetch_rss(url: &str) -> Option<rss::Channel> {
  let client = reqwest::Client::builder().build();

  let response = match client {
    Ok(cl) => cl.get(url).send().await,
    Err(_) => return None,
  };

  match response {
    Ok(response) => match response.status() {
      reqwest::StatusCode::OK => {
        let content = match response.bytes().await {
          Ok(ctn) => ctn,
          Err(_) => return None,
        };

        match rss::Channel::read_from(&content[..]).map(|channel| channel) {
          Ok(channel) => Some(channel),
          Err(_) => None,
        }
      },
      _ => {
        println!("{}", &response.status()); // TODO: log
        None
      }
    },
    Err(_) => None,
  }
}

// 2- convert to channel, defined type
pub fn new_channel(url: &str, res: &rss::Channel, ty: &str, title: Option<String>) -> NewChannel {
  let date = match &res.pub_date {
    Some(t) => String::from(t),
    None => String::from(""),
  };
  let channel_title = match title {
    Some(t) if t.trim().len() > 0 => {
      String::from(t.trim())
    },
    _ =>  res.title.to_string(),
  };
  let channel = NewChannel {
    title: channel_title,
    link: url.to_string(),
    description: res.description.to_string(),
    published: date,
    ty: ty.to_string(),
  };

  return channel;
}

// 3- convert to article, defined type
pub fn new_article_list(
  feed_url: &String,
  res: &rss::Channel,
) -> Vec<NewArticle> {
  let mut articles: Vec<NewArticle> = Vec::new();

  for item in res.items() {
    let title = item.title.clone().unwrap_or(String::from(""));
    let link = item.link.clone().unwrap_or(String::from(""));
    let content = item.content.clone().unwrap_or(String::from(""));
    let description = item
      .description
      .clone()
      .unwrap_or(String::from("no description"));
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
      feed_link: feed_url.to_string(),
      audio_url,
      description,
      published: String::from(item.pub_date().clone().unwrap_or("")),
      content,
      author: String::from(item.author().clone().unwrap_or("")),
      image: String::from(""),
    };

    articles.push(new_article);
  }

  return articles;
}

// # end process rss feed #

#[derive(Debug, Serialize, Deserialize)]
pub struct RssResult {
  pub channel: NewChannel,
  pub articles: Vec<NewArticle>,
}

#[command]
pub async fn fetch_feed(url: String) -> Option<RssResult> { 
  match fetch_rss(&url).await {
    Some(res) => {
      let channel = new_channel(&url, &res, "rss", None);
      let articles = new_article_list(&url, &res);

      Some(RssResult { channel, articles })
    }
    None => None,
  }
}

#[command]
pub async fn add_channel(url: String, ty: String, title: Option<String>) -> usize {
  println!("request channel {}", &url);

  let res = fetch_rss(&url).await;

  match res {
    Some(res) => {
      let channel = new_channel(&url, &res, &ty, title);
      // the input feed url may not be same as fetched feed link
      // input feed url as the real rss url
      let articles = new_article_list(&url, &res);

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
      let res = match fetch_rss(&channel.link).await {
        Some(r) => r,
        None => return 0,
      };
      let articles = new_article_list(&link, &res);

      println!("{:?}", &articles.len());

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
