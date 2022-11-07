// @generated automatically by Diesel CLI.

diesel::table! {
  articles (id) {
    id -> Integer,
    title -> Text,
    url -> Text,
    feed_link -> Text,
    description -> Text,
    published -> Timestamp,
    content -> Text,
    author -> Text,
    image -> Text,
    read_status -> Integer,
    star_status -> Integer,
  }
}

diesel::table! {
  channels (id) {
    id -> Integer,
    title -> Text,
    link -> Text,
    description -> Text,
    published -> Timestamp,
    ty -> Text,
  }
}

diesel::allow_tables_to_appear_in_same_query!(
    articles,
    channels,
);
