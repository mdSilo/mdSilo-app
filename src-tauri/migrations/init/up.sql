-- Your SQL goes here
DROP TABLE IF EXISTS channels;

CREATE TABLE channels (
  id INTEGER NOT NULL PRIMARY KEY,
  title VARCHAR NOT NULL,
  link VARCHAR NOT NULL UNIQUE,
  description VARCHAR NOT NULL,
  published DATETIME NOT NULL,
  ty VARCHAR NOT NULL DEFAULT 'rss'
);

DROP TABLE IF EXISTS articles;

CREATE TABLE articles (
  id INTEGER NOT NULL PRIMARY KEY,
  title VARCHAR NOT NULL,
  url VARCHAR NOT NULL UNIQUE,
  feed_link VARCHAR NOT NULL,
  description VARCHAR NOT NULL,
  published DATETIME,
  content VARCHAR,
  author VARCHAR,
  image VARCHAR,
  read_status INTEGER NOT NULL DEFAULT 1 -- 1: unread 2: read
);
