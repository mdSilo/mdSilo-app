//! The index of a workspace on disk (SQLite): the files with what their
//! markdown links to and contains, so a workspace opens without reading and
//! parsing the notes not changed since.

use super::parse::Parsed;
use diesel::prelude::*;
use diesel::sql_types::{BigInt, Integer, Text};
use diesel::sqlite::SqliteConnection;
use std::path::Path;

/// Bump to rebuild the indexes of older versions.
pub const SCHEMA_VERSION: i32 = 2;

/// A file indexed, its path relative to the workspace (`/` separated).
#[derive(Debug, Clone, PartialEq, Eq, QueryableByName)]
pub struct Row {
  #[diesel(sql_type = Text)]
  pub path: String,
  #[diesel(sql_type = Integer)]
  pub is_dir: i32,
  #[diesel(sql_type = BigInt)]
  pub size: i64,
  #[diesel(sql_type = BigInt)]
  pub modified: i64,
  #[diesel(sql_type = BigInt)]
  pub created: i64,
  /// Parsed, as JSON; empty for the files not parsed (not markdown)
  #[diesel(sql_type = Text)]
  pub parsed: String,
}

impl Row {
  pub fn parsed(&self) -> Parsed {
    serde_json::from_str(&self.parsed).unwrap_or_default()
  }
}

#[derive(QueryableByName)]
struct Version {
  #[diesel(sql_type = Integer)]
  user_version: i32,
}

pub struct IndexDb {
  conn: SqliteConnection,
}

impl IndexDb {
  pub fn open(path: &Path) -> Result<Self, String> {
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let url = path.to_str().ok_or("index path is not UTF-8")?;
    let mut conn = SqliteConnection::establish(url).map_err(|e| e.to_string())?;
    let version = diesel::sql_query("PRAGMA user_version")
      .get_result::<Version>(&mut conn)
      .map(|v| v.user_version)
      .unwrap_or(0);
    if version != SCHEMA_VERSION {
      for table in ["files", "books"] {
        diesel::sql_query(format!("DROP TABLE IF EXISTS {table}")).execute(&mut conn).map_err(|e| e.to_string())?;
      }
    }
    for sql in [
      "PRAGMA journal_mode = WAL",
      "PRAGMA synchronous = NORMAL",
      "CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY NOT NULL,
        is_dir INTEGER NOT NULL,
        size INTEGER NOT NULL,
        modified INTEGER NOT NULL,
        created INTEGER NOT NULL,
        parsed TEXT NOT NULL
      )",
      // the books whose text is in the search index
      "CREATE TABLE IF NOT EXISTS books (hash TEXT PRIMARY KEY NOT NULL, indexed INTEGER NOT NULL)",
    ] {
      diesel::sql_query(sql).execute(&mut conn).map_err(|e| e.to_string())?;
    }
    diesel::sql_query(format!("PRAGMA user_version = {SCHEMA_VERSION}"))
      .execute(&mut conn)
      .map_err(|e| e.to_string())?;
    Ok(Self { conn })
  }

  pub fn all(&mut self) -> Vec<Row> {
    diesel::sql_query("SELECT path, is_dir, size, modified, created, parsed FROM files")
      .load::<Row>(&mut self.conn)
      .unwrap_or_default()
  }

  /// Insert or replace the rows, in one transaction.
  pub fn put(&mut self, rows: &[Row]) -> Result<(), String> {
    if rows.is_empty() {
      return Ok(());
    }
    self
      .conn
      .transaction::<_, diesel::result::Error, _>(|conn| {
        for row in rows {
          diesel::sql_query(
            "INSERT OR REPLACE INTO files (path, is_dir, size, modified, created, parsed) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind::<Text, _>(&row.path)
          .bind::<Integer, _>(row.is_dir)
          .bind::<BigInt, _>(row.size)
          .bind::<BigInt, _>(row.modified)
          .bind::<BigInt, _>(row.created)
          .bind::<Text, _>(&row.parsed)
          .execute(conn)?;
        }
        Ok(())
      })
      .map_err(|e| e.to_string())
  }

  /// Delete the rows of the paths, and of the paths under them (dirs).
  pub fn delete(&mut self, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
      return Ok(());
    }
    self
      .conn
      .transaction::<_, diesel::result::Error, _>(|conn| {
        for path in paths {
          diesel::sql_query("DELETE FROM files WHERE path = ? OR substr(path, 1, ?) = ?")
            .bind::<Text, _>(path)
            .bind::<Integer, _>(path.len() as i32 + 1)
            .bind::<Text, _>(format!("{path}/"))
            .execute(conn)?;
        }
        Ok(())
      })
      .map_err(|e| e.to_string())
  }
}

#[derive(QueryableByName)]
struct Count {
  #[diesel(sql_type = BigInt)]
  n: i64,
}

impl IndexDb {
  /// The book's text is in the search index.
  pub fn book_indexed(&mut self, hash: &str) -> bool {
    diesel::sql_query("SELECT count(*) AS n FROM books WHERE hash = ?")
      .bind::<Text, _>(hash)
      .get_result::<Count>(&mut self.conn)
      .is_ok_and(|c| c.n > 0)
  }

  pub fn set_book_indexed(&mut self, hash: &str, indexed: bool) -> Result<(), String> {
    let sql = if indexed {
      "INSERT OR REPLACE INTO books (hash, indexed) VALUES (?, strftime('%s','now'))"
    } else {
      "DELETE FROM books WHERE hash = ?"
    };
    diesel::sql_query(sql).bind::<Text, _>(hash).execute(&mut self.conn).map(|_| ()).map_err(|e| e.to_string())
  }

  /// Forget the books indexed, e.g. the search index made anew.
  pub fn clear_books(&mut self) -> Result<(), String> {
    diesel::sql_query("DELETE FROM books").execute(&mut self.conn).map(|_| ()).map_err(|e| e.to_string())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn row(path: &str, parsed: &Parsed) -> Row {
    Row {
      path: path.into(),
      is_dir: 0,
      size: 1,
      modified: 2,
      created: 3,
      parsed: serde_json::to_string(parsed).unwrap(),
    }
  }

  #[test]
  fn stores_the_rows() {
    let dir = std::env::temp_dir().join(format!("mdsilo-index-db-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let path = dir.join("index.db");
    let mut db = IndexDb::open(&path).unwrap();
    let parsed = Parsed { links: vec!["b".into()], tags: vec!["t".into()], issues: vec![1], books: vec!["Dune".into()], has_tasks: true };
    db.put(&[row("a.md", &parsed), row("sub/b.md", &Parsed::default()), row("sub", &Parsed::default())]).unwrap();
    assert_eq!(db.all().into_iter().find(|r| r.path == "a.md").unwrap().parsed(), parsed);
    assert_eq!(db.all().len(), 3);
    // a dir: its files too, not the paths sharing its prefix
    db.put(&[row("subway.md", &Parsed::default())]).unwrap();
    db.delete(&["sub".to_string()]).unwrap();
    let mut paths: Vec<String> = db.all().into_iter().map(|r| r.path).collect();
    paths.sort();
    assert_eq!(paths, ["a.md", "subway.md"]);
    assert!(!db.book_indexed("h"));
    db.set_book_indexed("h", true).unwrap();
    assert!(db.book_indexed("h"));
    db.clear_books().unwrap();
    assert!(!db.book_indexed("h"));
    drop(db);
    // reopened: kept
    assert_eq!(IndexDb::open(&path).unwrap().all().len(), 2);
    std::fs::remove_dir_all(&dir).unwrap();
  }
}
