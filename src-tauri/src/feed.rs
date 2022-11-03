use std::collections::HashMap;
use reqwest;
use tauri::command;

use crate::db;
use crate::models::{Channel, NewChannel, NewArticle};

pub async fn fetch_rss_item(url: &str) -> Option<rss::Channel> {
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

pub fn new_channel(res: &rss::Channel) -> NewChannel {
  let date = match &res.pub_date {
    Some(t) => String::from(t),
    None => String::from(""),
  };
  let channel = NewChannel {
    title: res.title.to_string(),
    link: res.link.to_string(),
    description: res.description.to_string(),
    published: date,
  };

  return channel;
}

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
    let date = String::from(item.pub_date().clone().unwrap_or(""));

    let s = NewArticle {
      title,
      url: link,
      feed_link: feed_url.to_string(),
      description,
      published: date,
      content,
    };

    articles.push(s);
  }

  articles
}

#[command]
pub async fn fetch_feed(url: String) -> Option<rss::Channel> {
  let res = fetch_rss_item(&url).await;

  res
}

#[command]
pub async fn get_channels() -> Vec<Channel> {
  let results = db::get_channels();

  return results;
}

#[command]
pub async fn add_channel(url: String) -> usize {
  println!("request channel {}", &url);

  let res = fetch_rss_item(&url).await;

  match res {
    Some(res) => {
      let channel = new_channel(&res);
      let articles = new_article_list(&url, &res);
      let res = db::add_channel(channel, articles);

      res
    }
    None => 0,
  }
}

#[command]
pub async fn import_channels(list: Vec<String>) -> usize {
  println!("{:?}", &list);
  for url in &list {
    add_channel(url.to_string()).await;
  }
  1
}

#[command]
pub fn delete_channel(link: String) -> usize {
  let result = db::delete_channel(link);

  result
}

#[command]
pub async fn add_articles_with_channel_link(link: String) -> usize {
  let channel = db::get_channel_by_link(link);
  match channel {
    Some(channel) => {
      let res = match fetch_rss_item(&channel.link).await {
        Some(r) => r,
        None => return 0,
      };
      let articles = new_article_list(&channel.link, &res);

      println!("{:?}", &articles.len());

      let result = db::add_articles(String::from(&channel.link), articles);

      result
    }
    None => 0,
  }
}

#[command]
pub fn get_articles(feed_link: String, filter: db::ArticleFilter) -> db::ArticleQueryResult {
  println!("get articles from rust");
  let res = db::get_articles(db::ArticleFilter {
    feed_link: Some(feed_link),
    read_status: filter.read_status,
  });

  res
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
  let res = db::update_article_read_status(url, status);

  res
}

#[command]
pub fn mark_all_read(feed_link: String) -> usize {
  let res = db::update_articles_read_status_channel(feed_link);

  res
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
