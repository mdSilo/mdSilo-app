use super::schema::{articles, channels};
use diesel::{sql_types::*, Insertable, Queryable, QueryableByName};
use serde::{Deserialize, Serialize};

#[derive(Debug, Queryable, Serialize, QueryableByName)]
pub struct Channel {
  #[diesel(sql_type = Integer)]
  pub id: i32,
  #[diesel(sql_type = Text)]
  pub title: String,
  #[diesel(sql_type = Text)]
  pub link: String,
  #[diesel(sql_type = Text)]
  pub description: String,
  #[diesel(sql_type = Text)]
  pub published: String,
  #[diesel(sql_type = Text)]
  pub ty: String, // podcast || rss
}

#[derive(Debug, Queryable, Serialize, QueryableByName)]
pub struct Article {
  #[diesel(sql_type = Integer)]
  pub id: i32,
  #[diesel(sql_type = Text)]
  pub title: String,
  #[diesel(sql_type = Text)]
  pub url: String,
  #[diesel(sql_type = Text)]
  pub feed_link: String,
  #[diesel(sql_type = Text)]
  pub audio_url: String,
  #[diesel(sql_type = Text)]
  pub description: String,
  #[diesel(sql_type = Text)]
  pub published: String,
  #[diesel(sql_type = Text)]
  pub content: String,
  #[diesel(sql_type = Text)]
  pub author: String,
  #[diesel(sql_type = Text)]
  pub image: String,
  #[diesel(sql_type = Integer)]
  pub read_status: i32,
  #[diesel(sql_type = Integer)]
  pub star_status: i32,
}

#[derive(Debug, Insertable, Serialize, Deserialize)]
#[diesel(table_name = channels)]
pub struct NewChannel {
  pub title: String,
  pub link: String,
  pub description: String,
  pub published: String,
  pub ty: String,
}

#[derive(Debug, Insertable, Clone, Serialize, Deserialize)]
#[diesel(table_name = articles)]
pub struct NewArticle {
  pub title: String,
  pub url: String,
  pub feed_link: String,
  pub audio_url: String,
  pub description: String,
  pub content: String,
  pub published: String,
  pub author: String,
  pub image: String,
}

// #[derive(Debug, Insertable, Queryable, Serialize, QueryableByName)]
// #[diesel(table_name = notes)]
// pub struct Note {
//   #[diesel(sql_type = Text)]
//   pub id: String,
//   #[diesel(sql_type = Text)]
//   pub content: String,
//   #[diesel(sql_type = Text)]
//   pub saved: String,
// }

// TODO: save daily activities to db
