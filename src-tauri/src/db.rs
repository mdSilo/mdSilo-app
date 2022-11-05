use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use serde::Deserialize;
use serde::Serialize;
use std::path;
use tauri::api::path::local_data_dir;

use crate::models::{Channel, NewChannel, Article, NewArticle};
use crate::schema;

pub fn establish_connection() -> SqliteConnection {
  let db_url = path::Path::new(&local_data_dir().unwrap())
    .join("mdsilo")
    .join("mdsilo.db");

  let database_url = db_url.to_str().clone().unwrap();

  SqliteConnection::establish(&database_url)
    .expect(&format!("Error connecting to {}", &database_url))
  
}

pub fn get_channels() -> Vec<Channel> {
  let mut connection = establish_connection();
  let results = schema::channels::dsl::channels
    .load::<Channel>(&mut connection)
    .unwrap_or(vec![]);

  return results;
}

pub fn add_channel(channel: NewChannel, articles: Vec<NewArticle>) -> usize {
  let mut connection = establish_connection();
  let result = diesel::insert_or_ignore_into(schema::channels::dsl::channels)
    .values(channel)
    .execute(&mut connection)
    .unwrap_or(0);

  println!(" new result {:?}", result);

  if result == 1 {
    diesel::insert_or_ignore_into(schema::articles::dsl::articles)
      .values(articles)
      .execute(&mut connection)
      .unwrap_or(0);
  }

  return result;
}

// per link
pub fn delete_channel(link: String) -> usize {
  let mut connection = establish_connection();
  // query channel if existing
  let channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&link))
    .load::<Channel>(&mut connection)
    .unwrap_or(vec![]);

  // del channel and it's articles
  if channel.len() == 1 {
    let result =
      diesel::delete(
        schema::channels::dsl::channels.filter(schema::channels::link.eq(&link))
      )
      .execute(&mut connection)
      .unwrap_or(0);

    diesel::delete(
      schema::articles::dsl::articles.filter(schema::articles::feed_link.eq(&link)),
    )
    .execute(&mut connection)
    .unwrap_or(0);

    return result;
  } else {
    return 0;
  }
}

pub fn get_channel_by_link(link: String) -> Option<Channel> {
  let mut connection = establish_connection();
  let mut channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&link))
    .load::<Channel>(&mut connection)
    .unwrap_or(vec![]);

  if channel.len() == 1 {
    return channel.pop();
  } else {
    return None;
  }
}

#[derive(Debug, Queryable, Serialize, QueryableByName)]
pub struct UnreadNum {
  #[diesel(sql_type = diesel::sql_types::Text)]
  pub feed_link: String,
  #[diesel(sql_type = diesel::sql_types::Integer)]
  pub unread_count: i32,
}

pub fn get_unread_num() -> Vec<UnreadNum> {
  const SQL_QUERY_UNREAD_TOTAL: &str = "
    SELECT id, feed_link, count(read_status) as unread_count 
    FROM articles WHERE read_status = 1 group by feed_link;
    ";
  let mut connection = establish_connection();
  let record = diesel::sql_query(SQL_QUERY_UNREAD_TOTAL)
    .load::<UnreadNum>(&mut connection)
    .unwrap_or(vec![]);

  record
}

pub fn add_articles(feed_link: String, articles: Vec<NewArticle>) -> usize {
  let mut connection = establish_connection();
  let channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&feed_link))
    .load::<Channel>(&mut connection)
    .unwrap_or(vec![]);

  if channel.len() == 1 {
    let result = diesel::insert_or_ignore_into(schema::articles::dsl::articles)
      .values(articles)
      .execute(&mut connection)
      .unwrap_or(0);

    return result;
  } else {
    return 0;
  }
}

pub fn get_article_by_url(url: String) -> Option<Article> {
  let mut connection = establish_connection();
  let mut result = schema::articles::dsl::articles
    .filter(schema::articles::url.eq(&url))
    .load::<Article>(&mut connection)
    .unwrap_or(vec![]);

  if result.len() == 1 {
    return result.pop();
  } else {
    return None;
  }
}

pub fn update_article_read_status(url: String, status: i32) -> usize {
  let mut connection = establish_connection();
  let article = get_article_by_url(String::from(&url));

  match article {
    Some(_) => {
      diesel::update(
        schema::articles::dsl::articles.filter(schema::articles::url.eq(&url))
      )
      .set(schema::articles::read_status.eq(status))
      .execute(&mut connection)
      .unwrap_or(0)
    },
    None => 0,
  }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArticleFilter {
  pub feed_link: Option<String>,
  pub read_status: Option<i32>,
}

pub fn get_articles(filter: ArticleFilter) -> Vec<Article> {
  let mut connection = establish_connection();
  let mut query = schema::articles::dsl::articles.into_boxed();

  match filter.feed_link {
    Some(feed_link) => {
      println!("feed_link: {:?}", feed_link);
      query = query.filter(schema::articles::feed_link.eq(feed_link));
    }
    None => {
      1;
    }
  }

  // match filter.read_status {
  //   Some(0) => {
  //     1;
  //   }
  //   Some(status) => {
  //     query = query.filter(schema::articles::read_status.eq(status));
  //   }
  //   None => {
  //     1;
  //   }
  // }

  let result = dbg!(query
    .load::<Article>(&mut connection))
    .unwrap_or(vec![]);

  println!("articles result: {:?}", result);

  return result;
}

pub fn update_articles_read_status_channel(feed_link: String) -> usize {
  let mut connection = establish_connection();
  let result = diesel::update(
    schema::articles::dsl::articles
      .filter(schema::articles::feed_link.eq(feed_link))
      .filter(schema::articles::read_status.eq(1)),
  )
  .set(schema::articles::read_status.eq(2))
  .execute(&mut connection)
  .unwrap_or(0);

  return result;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_get_unread_num() {
    get_unread_num();
  }
}
