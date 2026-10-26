use crate::models::{Article, Channel, NewArticle, NewChannel};
use crate::schema;
use crate::storage::{create_mdsilo_dir, log_error};
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex, MutexGuard};

/// The connection of the app, opened on the first use; one query at a time
static CONNECTION: LazyLock<Mutex<SqliteConnection>> =
  LazyLock::new(|| Mutex::new(establish_connection()));

/// The connection of the app, instead of opening the database every time.
/// Release it before calling another function of this module.
pub fn connection() -> MutexGuard<'static, SqliteConnection> {
  CONNECTION.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn establish_connection() -> SqliteConnection {
  let data_path = create_mdsilo_dir().expect("Error on creating data dir");

  let db_path = data_path.join("mdsilo.db");

  let database_url = db_path
    .to_str()
    .expect("Error on converting db path to url");

  SqliteConnection::establish(database_url)
    .map_err(|e| {
      log_error(format!("Error on connecting to db: {:?}", e))
    })
    .expect("Error on connecting to database")
}

pub fn get_channels() -> Vec<Channel> {
  let mut guard = connection();
  let connection = &mut *guard;
  

  schema::channels::dsl::channels
    .load::<Channel>(connection)
    .map_err(|e| {
      log_error(format!("db Error on [get_channels]: {:?}", e))
    })
    .unwrap_or_else(|_| vec![])
}

pub fn add_channel(channel: NewChannel, articles: Vec<NewArticle>) -> usize {
  let mut guard = connection();
  let connection = &mut *guard;
  // insert channel
  let result = diesel::insert_or_ignore_into(schema::channels::dsl::channels)
    .values(channel)
    .execute(connection)
    .map_err(|e| {
      log_error(format!("db Error on [add_channels: insert channel]: {:?}", e))
    })
    .unwrap_or(0);

  // println!("new channel result {:?}", result);

  // TODO: check if add channel failed
  // insert articles
  diesel::insert_or_ignore_into(schema::articles::dsl::articles)
    .values(articles)
    .execute(connection)
    .map_err(|e| {
      log_error(format!("db Error on [add_channels: insert articles]: {:?}", e))
    })
    .unwrap_or(0);

  result
}

// per link
pub fn delete_channel(link: String) -> usize {
  let mut guard = connection();
  let connection = &mut *guard;
  // query channel if existing
  let channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&link))
    .load::<Channel>(connection)
    .map_err(|e| {
      log_error(format!(
          "db Error on [delete_channel: query channel, {}]: {:?}",
          link, e
        ))
    })
    .unwrap_or_else(|_| vec![]);

  // del channel and it's articles
  if channel.len() == 1 {
    let result = diesel::delete(
      schema::channels::dsl::channels.filter(schema::channels::link.eq(&link)),
    )
    .execute(connection)
    .map_err(|e| {
      log_error(format!("db Error on [delete_channel: del channel]: {:?}", e))
    })
    .unwrap_or(0);

    diesel::delete(
      schema::articles::dsl::articles.filter(schema::articles::feed_link.eq(&link)),
    )
    .execute(connection)
    .map_err(|e| {
      log_error(format!("db Error on [delete_channel: del articles]: {:?}", e))
    })
    .unwrap_or(0);

    result
  } else {
    0
  }
}

pub fn get_channel_by_link(link: String) -> Option<Channel> {
  let mut guard = connection();
  let connection = &mut *guard;
  let mut channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&link))
    .load::<Channel>(connection)
    .map_err(|e| {
      log_error(format!("db Error on [get_channel_by_link: {}]: {:?}", link, e))
    })
    .unwrap_or_else(|_| vec![]);

  if channel.len() == 1 {
    channel.pop()
  } else {
    None
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
  let mut guard = connection();
  let connection = &mut *guard;
  

  diesel::sql_query(SQL_QUERY_UNREAD_NUM)
    .load::<UnreadNum>(connection)
    .map_err(|e| {
      log_error(format!("db Error on [get_unread_num]: {:?}", e))
    })
    .unwrap_or_else(|_| vec![])
}

pub fn add_articles(feed_link: String, articles: Vec<NewArticle>) -> usize {
  let mut guard = connection();
  let connection = &mut *guard;
  let channel = schema::channels::dsl::channels
    .filter(schema::channels::link.eq(&feed_link))
    .load::<Channel>(connection)
    .map_err(|e| {
      log_error(format!(
          "db Error on [add_articles: get channel, {}]: {:?}",
          feed_link, e
        ))
    })
    .unwrap_or_else(|_| vec![]);

  if channel.len() == 1 {
    

    diesel::insert_or_ignore_into(schema::articles::dsl::articles)
      .values(articles)
      .execute(connection)
      .map_err(|e| {
        log_error(format!(
            "db Error on [add_articles: to channel, {}]: {:?}",
            feed_link, e
          ))
      })
      .unwrap_or(0)
  } else {
    0
  }
}

pub fn get_article_by_url(url: String) -> Option<Article> {
  let mut guard = connection();
  let connection = &mut *guard;
  let mut result = schema::articles::dsl::articles
    .filter(schema::articles::url.eq(&url))
    .load::<Article>(connection)
    .map_err(|e| {
      log_error(format!("db Error on [get_article_by_url, {}]: {:?}", url, e))
    })
    .unwrap_or_else(|_| vec![]);

  if result.len() == 1 {
    result.pop()
  } else {
    None
  }
}

pub fn update_article_read_status(url: String, status: i32) -> usize {
  let mut guard = connection();
  let connection = &mut *guard;
  let article = get_article_by_url(String::from(&url));

  match article {
    Some(_) => diesel::update(
      schema::articles::dsl::articles.filter(schema::articles::url.eq(&url)),
    )
    .set(schema::articles::read_status.eq(status))
    .execute(connection)
    .map_err(|e| {
      log_error(format!("db Error on [update_article_read_status: {}]: {:?}", url, e))
    })
    .unwrap_or(0),
    None => 0,
  }
}

pub fn update_article_star_status(url: String, status: i32) -> usize {
  let mut guard = connection();
  let connection = &mut *guard;
  let article = get_article_by_url(String::from(&url));

  match article {
    Some(_) => diesel::update(
      schema::articles::dsl::articles.filter(schema::articles::url.eq(&url)),
    )
    .set(schema::articles::star_status.eq(status))
    .execute(connection)
    .map_err(|e| {
      log_error(format!("db Error on [update_article_star_status, {}]: {:?}", url, e))
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
  let mut guard = connection();
  let connection = &mut *guard;
  let mut query = schema::articles::dsl::articles.into_boxed();
  // println!("filter to get articles: {:?}", filter);

  if let Some(feed_link) = filter.feed_link.clone() {
    // println!("feed_link: {:?}", feed_link);
    query = query.filter(schema::articles::feed_link.eq(feed_link));
  }

  if let Some(read_status) = filter.read_status {
    // println!("read status: {:?}", read_status);
    query = query.filter(schema::articles::read_status.eq(read_status));
  }

  if let Some(star_status) = filter.star_status {
    // println!("star status: {:?}", star_status);
    query = query.filter(schema::articles::star_status.eq(star_status));
  }

  let result = query
    .load::<Article>(connection)
    .map_err(|e| {
      log_error(format!(
          "db Error on [get_articles, per fileter: {:?}]: {:?}",
          filter, e
        ))
    })
    .unwrap_or_else(|_| vec![]);

  // println!("get articles result: {:?}", result);

  result
}

pub fn update_articles_read_status(feed_link: String, read_status: i32) -> usize {
  let mut guard = connection();
  let connection = &mut *guard;
  

  diesel::update(
    schema::articles::dsl::articles
      .filter(schema::articles::feed_link.eq(feed_link)),
  )
  .set(schema::articles::read_status.eq(read_status))
  .execute(connection)
  .map_err(|e| {
    log_error(format!("db Error on [update_articles_read_status]: {:?}", e))
  })
  .unwrap_or(0)
}

/* pub fn save_notes(notes: Note) -> usize {
  let mut guard = connection();
  let connection = &mut *guard;

  let result = diesel::insert_or_ignore_into(schema::notes::dsl::notes)
    .values(notes)
    .execute(connection)
    .map_err(|e| log_error(format!("db Error on [save_notes]: {:?}", e)))
    .unwrap_or(0);

  return result;
}

pub fn get_notes_by_id(id: String) -> Option<Note> {
  let mut guard = connection();
  let connection = &mut *guard;
  let mut result = schema::notes::dsl::notes
    .filter(schema::notes::id.eq(&id))
    .load::<Note>(connection)
    .map_err(|e| log_error(format!("db Error on [get_notes_by_id, {}]: {:?}", id, e)))
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
