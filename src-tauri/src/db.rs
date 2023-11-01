use crate::models::{Article, Channel, NewArticle, NewChannel};
use crate::schema;
use crate::storage::{create_mdsilo_dir, do_log};
use chrono::offset::Local;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};

pub fn establish_connection() -> SqliteConnection {
  let data_path = create_mdsilo_dir().expect("Error on creating data dir");

  let db_path = data_path.join("mdsilo.db");

  let database_url = db_path
    .to_str()
    .clone()
    .expect("Error on converting db path to url");

  SqliteConnection::establish(&database_url)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("Error on connecting to db: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .expect("Error on connecting to database")
}

pub fn get_channels() -> Vec<Channel> {
  let mut connection = establish_connection();
  let results = schema::channels::dsl::channels
    .load::<Channel>(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [get_channels]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| vec![]);

  return results;
}

pub fn add_channel(channel: NewChannel, articles: Vec<NewArticle>) -> usize {
  let mut connection = establish_connection();
  // insert channel
  let result = diesel::insert_or_ignore_into(schema::channels::dsl::channels)
    .values(channel)
    .execute(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [add_channels: insert channel]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or(0);

  // println!("new channel result {:?}", result);

  // TODO: check if add channel failed
  // insert articles
  diesel::insert_or_ignore_into(schema::articles::dsl::articles)
    .values(articles)
    .execute(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [add_channels: insert articles]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or(0);

  return result;
}

// per link
pub fn delete_channel(link: String) -> usize {
  let mut connection = establish_connection();
  // query channel if existing
  let channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&link))
    .load::<Channel>(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!(
          "db Error on [delete_channel: query channel, {}]: {:?}",
          link, e
        ),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| vec![]);

  // del channel and it's articles
  if channel.len() == 1 {
    let result = diesel::delete(
      schema::channels::dsl::channels.filter(schema::channels::link.eq(&link)),
    )
    .execute(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [delete_channel: del channel]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or(0);

    diesel::delete(
      schema::articles::dsl::articles.filter(schema::articles::feed_link.eq(&link)),
    )
    .execute(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [delete_channel: del articles]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
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
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [get_channel_by_link: {}]: {:?}", link, e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| vec![]);

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
  const SQL_QUERY_UNREAD_NUM: &str = "
    SELECT id, feed_link, count(read_status) as unread_count 
    FROM articles WHERE read_status = 0 group by feed_link;
    ";
  let mut connection = establish_connection();
  let record = diesel::sql_query(SQL_QUERY_UNREAD_NUM)
    .load::<UnreadNum>(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [get_unread_num]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| vec![]);

  return record;
}

pub fn add_articles(feed_link: String, articles: Vec<NewArticle>) -> usize {
  let mut connection = establish_connection();
  let channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&feed_link))
    .load::<Channel>(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!(
          "db Error on [add_articles: get channel, {}]: {:?}",
          feed_link, e
        ),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| vec![]);

  if channel.len() == 1 {
    let result = diesel::insert_or_ignore_into(schema::articles::dsl::articles)
      .values(articles)
      .execute(&mut connection)
      .map_err(|e| {
        do_log(
          "Error".to_string(),
          format!(
            "db Error on [add_articles: to channel, {}]: {:?}",
            feed_link, e
          ),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        )
      })
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
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [get_article_by_url, {}]: {:?}", url, e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| vec![]);

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
    Some(_) => diesel::update(
      schema::articles::dsl::articles.filter(schema::articles::url.eq(&url)),
    )
    .set(schema::articles::read_status.eq(status))
    .execute(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [update_article_read_status: {}]: {:?}", url, e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or(0),
    None => 0,
  }
}

pub fn update_article_star_status(url: String, status: i32) -> usize {
  let mut connection = establish_connection();
  let article = get_article_by_url(String::from(&url));

  match article {
    Some(_) => diesel::update(
      schema::articles::dsl::articles.filter(schema::articles::url.eq(&url)),
    )
    .set(schema::articles::star_status.eq(status))
    .execute(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!("db Error on [update_article_star_status, {}]: {:?}", url, e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or(0),
    None => 0,
  }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArticleFilter {
  pub feed_link: Option<String>,
  pub read_status: Option<i32>,
  pub star_status: Option<i32>,
}

pub fn get_articles(filter: ArticleFilter) -> Vec<Article> {
  let mut connection = establish_connection();
  let mut query = schema::articles::dsl::articles.into_boxed();
  // println!("filter to get articles: {:?}", filter);

  if let Some(feed_link) = filter.feed_link.clone() {
    // println!("feed_link: {:?}", feed_link);
    query = query.filter(schema::articles::feed_link.eq(feed_link));
  }

  if let Some(read_status) = filter.read_status.clone() {
    // println!("read status: {:?}", read_status);
    query = query.filter(schema::articles::read_status.eq(read_status));
  }

  if let Some(star_status) = filter.star_status.clone() {
    // println!("star status: {:?}", star_status);
    query = query.filter(schema::articles::star_status.eq(star_status));
  }

  let result = query
    .load::<Article>(&mut connection)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!(
          "db Error on [get_articles, per fileter: {:?}]: {:?}",
          filter, e
        ),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| vec![]);

  // println!("get articles result: {:?}", result);

  return result;
}

pub fn update_articles_read_status(feed_link: String, read_status: i32) -> usize {
  let mut connection = establish_connection();
  let result = diesel::update(
    schema::articles::dsl::articles
      .filter(schema::articles::feed_link.eq(feed_link)),
  )
  .set(schema::articles::read_status.eq(read_status))
  .execute(&mut connection)
  .map_err(|e| {
    do_log(
      "Error".to_string(),
      format!("db Error on [update_articles_read_status]: {:?}", e),
      format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
    )
  })
  .unwrap_or(0);

  return result;
}

/* pub fn save_notes(notes: Note) -> usize {
  let mut connection = establish_connection();

  let result = diesel::insert_or_ignore_into(schema::notes::dsl::notes)
    .values(notes)
    .execute(&mut connection)
    .map_err(|e| do_log(
      "Error".to_string(),
      format!("db Error on [save_notes]: {:?}", e),
      format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S"))
    ))
    .unwrap_or(0);

  return result;
}

pub fn get_notes_by_id(id: String) -> Option<Note> {
  let mut connection = establish_connection();
  let mut result = schema::notes::dsl::notes
    .filter(schema::notes::id.eq(&id))
    .load::<Note>(&mut connection)
    .map_err(|e| do_log(
      "Error".to_string(),
      format!("db Error on [get_notes_by_id, {}]: {:?}", id, e),
      format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S"))
    ))
    .unwrap_or_else(|_| vec![]);

  if result.len() == 1 {
    return result.pop();
  } else {
    return None;
  }
} */

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_get_unread_num() {
    get_unread_num();
  }
}
