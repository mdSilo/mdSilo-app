-- Your SQL goes here
DROP TABLE IF EXISTS channels;

CREATE TABLE channels (
  id INTEGER NOT NULL PRIMARY KEY,
  title VARCHAR NOT NULL,
  link VARCHAR NOT NULL UNIQUE,
  description VARCHAR,
  published DATETIME,
  ty VARCHAR NOT NULL DEFAULT 'rss'
);

DROP TABLE IF EXISTS articles;

CREATE TABLE articles (
  id INTEGER NOT NULL PRIMARY KEY,
  title VARCHAR NOT NULL,
  url VARCHAR NOT NULL UNIQUE,
  feed_link VARCHAR NOT NULL,
  audio_url VARCHAR NOT NULL DEFAULT '',
  description VARCHAR NOT NULL,
  published DATETIME,
  content VARCHAR,
  author VARCHAR,
  image VARCHAR,
  read_status INTEGER NOT NULL DEFAULT 0, -- 0: unread 1: read
  star_status INTEGER NOT NULL DEFAULT 0  -- 0: unstar 1: star-ed
);

-- DROP TABLE IF EXISTS notes;

-- CREATE TABLE notes (
--   id VARCHAR NOT NULL PRIMARY KEY, -- root dir
--   content TEXT NOT NULL,
--   saved DATETIME,
-- );
