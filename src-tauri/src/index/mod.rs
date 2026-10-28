//! The index of the workspace open (A3, A6): what the notes link to and
//! contain, kept on disk and up to date with the changes, so the app does not
//! need the content of all the notes; and the full-text search of the notes
//! and of the books read.
//!
//! In a workspace it is in `.mdsilo/local/` (index.db, search/), never synced;
//! for a legacy folder in the data dir of the app.

pub mod db;
pub mod parse;
pub mod search;

use crate::paths::PathExt;
use crate::storage::log_error;
use crate::wsfs::{FsEntry, LocalFs, WorkspaceFs};
use chrono::{SecondsFormat, TimeZone, Utc};
use db::{IndexDb, Row};
use search::{Doc, SearchIndex};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// A note (file or dir) of the workspace, as the frontend has them (Note),
/// without its content, with what it links to.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct IndexedNote {
  pub id: String,
  pub title: String,
  pub file_path: String,
  pub created_at: String,
  pub updated_at: String,
  pub is_dir: bool,
  pub size: u64,
  #[serde(flatten)]
  pub parsed: parse::Parsed,
}

/// The changes of the index after an update.
#[derive(Debug, Default, Clone, PartialEq, serde::Serialize)]
pub struct IndexDelta {
  pub updated: Vec<IndexedNote>,
  pub removed: Vec<String>,
}

pub struct WorkspaceIndex {
  root: PathBuf,
  fs: Box<dyn WorkspaceFs>,
  db: IndexDb,
  /// none if it can not be opened, e.g. the workspace open in another window
  search: Option<SearchIndex>,
}

/// Markdown (or text) notes are parsed and searched, as files.rs check_md
fn is_text_note(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .is_some_and(|e| matches!(e.to_ascii_lowercase().as_str(), "md" | "markdown" | "text" | "txt"))
}

fn to_rfc3339(millis: u64) -> String {
  Utc
    .timestamp_millis_opt(millis as i64)
    .earliest()
    .unwrap_or_else(Utc::now)
    .to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// A stable short name of a path, for the index dirs of legacy folders.
fn path_key(path: &Path) -> String {
  // FNV-1a
  let mut hash: u64 = 0xcbf29ce484222325;
  for byte in path.to_string_lossy().as_bytes() {
    hash ^= *byte as u64;
    hash = hash.wrapping_mul(0x100000001b3);
  }
  format!("{hash:016x}")
}

/// Where the index of a workspace is kept.
pub fn local_dir(root: &Path) -> Option<PathBuf> {
  if root.join(".mdsilo").join("workspace.json").is_file() {
    return Some(root.join(".mdsilo").join("local"));
  }
  dirs::data_local_dir().map(|d| d.join("mdsilo").join("index").join(path_key(root)))
}

impl WorkspaceIndex {
  pub fn open(root: &Path, local: &Path, fs: Box<dyn WorkspaceFs>) -> Result<Self, String> {
    let db = IndexDb::open(&local.join("index.db"))?;
    let search_dir = local.join("search");
    let fresh = !search_dir.join("VERSION").is_file();
    let search = match SearchIndex::open(&search_dir) {
      Ok(search) => Some(search),
      Err(e) => {
        log_error(format!("Error on [index: open search {}]: {e}", search_dir.display()));
        None
      }
    };
    let mut index = Self { root: root.to_path_buf(), fs, db, search };
    if fresh {
      // a new search index: the notes and books in it again
      index.db.clear_books()?;
      let all: Vec<String> = index.db.all().into_iter().map(|r| r.path).collect();
      index.db.delete(&all)?;
    }
    Ok(index)
  }

  pub fn root(&self) -> &Path {
    &self.root
  }

  fn rel(&self, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(&self.root).ok()?;
    let parts: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect();
    if parts.is_empty() || parts.iter().any(|p| p.starts_with('.')) {
      return None;
    }
    Some(parts.join("/"))
  }

  fn abs(&self, rel: &str) -> String {
    self.root.join(rel).normalize_slash().unwrap_or_else(|| self.root.join(rel).to_string_lossy().to_string())
  }

  fn note_of(&self, row: &Row) -> IndexedNote {
    let id = self.abs(&row.path);
    let name = Path::new(&row.path);
    IndexedNote {
      title: name.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_string(),
      file_path: id.clone(),
      id,
      created_at: to_rfc3339(row.created as u64),
      updated_at: to_rfc3339(row.modified as u64),
      is_dir: row.is_dir != 0,
      size: row.size as u64,
      parsed: row.parsed(),
    }
  }

  /// The row of an entry, its note parsed (and searchable) if it is one.
  fn row_of(&mut self, entry: &FsEntry, rel: String) -> Row {
    let mut parsed = String::new();
    if !entry.is_dir && is_text_note(&entry.path) {
      let content = self.fs.read_to_string(&entry.path).unwrap_or_default();
      parsed = serde_json::to_string(&parse::parse(&content)).unwrap_or_default();
      if let Some(search) = self.search.as_mut() {
        let title = entry.path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
        let doc = Doc { id: &rel, kind: "note", title, label: "", body: &content };
        if let Err(e) = search.put(doc) {
          log_error(format!("Error on [index: search put {rel}]: {e}"));
        }
      }
    }
    Row {
      path: rel,
      is_dir: entry.is_dir as i32,
      size: entry.size as i64,
      modified: entry.modified as i64,
      created: entry.created as i64,
      parsed,
    }
  }

  fn commit(&mut self) {
    if let Some(search) = self.search.as_mut()
      && let Err(e) = search.commit()
    {
      log_error(format!("Error on [index: search commit]: {e}"));
    }
  }

  /// Bring the index up to date with the files: only the notes new or
  /// changed (size, time) are read. Returns all the notes.
  pub fn sync(&mut self) -> Result<Vec<IndexedNote>, String> {
    let mut rows: HashMap<String, Row> = self.db.all().into_iter().map(|r| (r.path.clone(), r)).collect();
    let mut seen = HashSet::new();
    let mut changed = Vec::new();
    for entry in self.fs.walk(&self.root) {
      let Some(rel) = self.rel(&entry.path) else { continue };
      seen.insert(rel.clone());
      let same = rows.get(&rel).is_some_and(|r| {
        (r.is_dir != 0) == entry.is_dir && r.size == entry.size as i64 && r.modified == entry.modified as i64
      });
      if !same {
        changed.push(self.row_of(&entry, rel));
      }
    }
    let gone: Vec<String> = rows.keys().filter(|p| !seen.contains(*p)).cloned().collect();
    if let Some(search) = self.search.as_mut() {
      for path in &gone {
        search.delete(path);
      }
    }
    self.db.delete(&gone)?;
    self.db.put(&changed)?;
    self.commit();
    for path in &gone {
      rows.remove(path);
    }
    for row in changed {
      rows.insert(row.path.clone(), row);
    }
    Ok(rows.values().map(|r| self.note_of(r)).collect())
  }

  /// Update the index for the paths changed: added, changed or removed; a dir
  /// added with what it has.
  pub fn update(&mut self, paths: &[PathBuf]) -> Result<IndexDelta, String> {
    let mut delta = IndexDelta::default();
    let mut rows = Vec::new();
    let mut gone = Vec::new();
    for path in paths {
      let Some(rel) = self.rel(path) else { continue };
      match self.fs.stat(path) {
        Some(entry) => {
          if entry.is_dir {
            for child in self.fs.walk(path) {
              if let Some(child_rel) = self.rel(&child.path) {
                rows.push(self.row_of(&child, child_rel));
              }
            }
          }
          rows.push(self.row_of(&entry, rel));
        }
        None => {
          // the dir removed: its notes too
          let prefix = format!("{rel}/");
          if let Some(search) = self.search.as_mut() {
            search.delete(&rel);
            let _ = search.delete_prefix(&prefix);
          }
          delta.removed.push(self.abs(&rel));
          gone.push(rel);
        }
      }
    }
    self.db.delete(&gone)?;
    self.db.put(&rows)?;
    self.commit();
    delta.updated = rows.iter().map(|r| self.note_of(r)).collect();
    Ok(delta)
  }

  pub fn search(&self, query: &str, kind: Option<&str>, limit: usize) -> Result<Vec<SearchHit>, String> {
    let Some(search) = self.search.as_ref() else {
      return Err("search is not available".into());
    };
    Ok(
      search
        .search(query, kind, limit)?
        .into_iter()
        .map(|hit| SearchHit {
          path: if hit.kind == "note" { self.abs(&hit.id) } else { String::new() },
          id: hit.id,
          kind: hit.kind,
          title: hit.title,
          label: hit.label,
          snippet: hit.snippet,
          score: hit.score,
        })
        .collect(),
    )
  }

  /// Index the text of a book, by sections, replacing what it had.
  pub fn index_book(&mut self, hash: &str, title: &str, sections: &[BookSection]) -> Result<(), String> {
    let Some(search) = self.search.as_mut() else {
      return Err("search is not available".into());
    };
    search.delete_prefix(&format!("book:{hash}#"))?;
    for section in sections {
      let id = format!("book:{hash}#{}", section.cfi);
      search.put(Doc { id: &id, kind: "book", title, label: &section.label, body: &section.text })?;
    }
    search.commit()?;
    self.db.set_book_indexed(hash, true)
  }

  pub fn book_indexed(&mut self, hash: &str) -> bool {
    self.db.book_indexed(hash)
  }
}

/// A document found by the search: a note (its path), or a section of a
/// book (`book:<hash>#<cfi>`, as the links to books).
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct SearchHit {
  pub id: String,
  pub path: String,
  pub kind: String,
  pub title: String,
  pub label: String,
  pub snippet: String,
  pub score: f32,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BookSection {
  pub cfi: String,
  pub label: String,
  pub text: String,
}

/// The index of the workspace open, one at a time.
static CURRENT: Mutex<Option<WorkspaceIndex>> = Mutex::new(None);

fn with_index<T>(f: impl FnOnce(&mut WorkspaceIndex) -> Result<T, String>) -> Result<T, String> {
  let mut guard = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
  match guard.as_mut() {
    Some(index) => f(index),
    None => Err("no index open".into()),
  }
}

/// The paths as the index has them (its root canonical): e.g. /private/var
/// for /var on macOS. A path removed has no canonical form: its dir has.
fn canonical(paths: &[PathBuf]) -> Vec<PathBuf> {
  paths
    .iter()
    .map(|p| match (p.parent().and_then(|d| std::fs::canonicalize(d).ok()), p.file_name()) {
      (Some(dir), Some(name)) => dir.join(name),
      _ => p.clone(),
    })
    .collect()
}

/// Changes seen by the watcher (files.rs): the index follows them, the
/// changes the app made too. The paths out of the workspace are ignored.
pub fn on_changes(paths: &[PathBuf]) {
  if paths.is_empty() {
    return;
  }
  let paths = canonical(paths);
  let mut guard = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
  if let Some(index) = guard.as_mut()
    && let Err(e) = index.update(&paths)
  {
    log_error(format!("Error on [index: update on changes]: {e}"));
  }
}

fn open_index(dir: &str) -> Result<Vec<IndexedNote>, String> {
  let root = std::fs::canonicalize(dir).map_err(|e| e.to_string())?;
  let mut guard = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
  if guard.as_ref().is_none_or(|index| index.root() != root) {
    // the previous one is dropped first: its search writer released
    guard.take();
    let local = local_dir(&root).ok_or("no dir for the index")?;
    *guard = Some(WorkspaceIndex::open(&root, &local, Box::new(LocalFs))?);
  }
  guard.as_mut().unwrap().sync()
}

/// Open the index of a workspace, up to date: all its notes without content.
#[tauri::command]
pub async fn index_open(dir: String) -> Result<Vec<IndexedNote>, String> {
  tauri::async_runtime::spawn_blocking(move || open_index(&dir))
    .await
    .map_err(|e| e.to_string())?
}

/// Update the index for the paths changed, e.g. written by the app.
#[tauri::command]
pub async fn index_update(paths: Vec<String>) -> Result<IndexDelta, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let paths = canonical(&paths.iter().map(PathBuf::from).collect::<Vec<_>>());
    with_index(|index| index.update(&paths))
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Search the notes and the books: kind `note`, `book`, or any.
#[tauri::command]
pub async fn index_search(query: String, kind: Option<String>, limit: Option<usize>) -> Result<Vec<SearchHit>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    with_index(|index| index.search(&query, kind.as_deref(), limit.unwrap_or(50)))
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Index the text of a book read, to find it by search.
#[tauri::command]
pub async fn index_book(hash: String, title: String, sections: Vec<BookSection>) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || with_index(|index| index.index_book(&hash, &title, &sections)))
    .await
    .map_err(|e| e.to_string())?
}

/// The text of the book is indexed already.
#[tauri::command]
pub async fn index_book_indexed(hash: String) -> bool {
  tauri::async_runtime::spawn_blocking(move || with_index(|index| Ok(index.book_indexed(&hash))).unwrap_or(false))
    .await
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  fn setup(name: &str) -> (PathBuf, PathBuf) {
    let base = std::env::temp_dir().join(format!("mdsilo-ws-index-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("ws");
    fs::create_dir_all(root.join("writing/sub")).unwrap();
    fs::create_dir_all(root.join(".mdsilo/local")).unwrap();
    fs::write(root.join("writing/a.md"), "[[B]] #tag# [i](issue:7)\n- [ ] task").unwrap();
    fs::write(root.join("writing/sub/b.md"), "text about searching").unwrap();
    fs::write(root.join("writing/pic.png"), [0u8, 1]).unwrap();
    fs::write(root.join(".mdsilo/hidden.md"), "[[x]]").unwrap();
    (fs::canonicalize(&base).unwrap(), fs::canonicalize(&root).unwrap())
  }

  #[test]
  fn indexes_and_follows_the_changes() {
    let (base, root) = setup("sync");
    let local = base.join("local");
    let mut index = WorkspaceIndex::open(&root, &local, Box::new(LocalFs)).unwrap();
    let notes = index.sync().unwrap();
    let by_rel = |notes: &[IndexedNote], rel: &str| {
      let id = root.join(rel).normalize_slash().unwrap();
      notes.iter().find(|n| n.id == id).cloned()
    };
    assert_eq!(notes.len(), 5); // writing, writing/sub, a.md, b.md, pic.png
    let a = by_rel(&notes, "writing/a.md").unwrap();
    assert_eq!((a.title.as_str(), a.parsed.links.clone(), a.parsed.tags.clone()), ("a", vec!["B".to_string()], vec!["tag".to_string()]));
    assert_eq!(a.parsed.issues, [7]);
    assert!(a.parsed.has_tasks);
    assert!(by_rel(&notes, "writing/sub").unwrap().is_dir);
    assert!(a.updated_at.ends_with('Z'));
    assert_eq!(index.search("searching", None, 10).unwrap()[0].path, by_rel(&notes, "writing/sub/b.md").unwrap().id);

    // changed and removed files, a new dir
    fs::write(root.join("writing/a.md"), "now links [[C]], longer").unwrap();
    fs::remove_dir_all(root.join("writing/sub")).unwrap();
    fs::create_dir_all(root.join("writing/new")).unwrap();
    fs::write(root.join("writing/new/c.md"), "c").unwrap();
    let delta = index
      .update(&[root.join("writing/a.md"), root.join("writing/sub"), root.join("writing/new")])
      .unwrap();
    assert_eq!(delta.removed, [root.join("writing/sub").normalize_slash().unwrap()]);
    assert_eq!(by_rel(&delta.updated, "writing/a.md").unwrap().parsed.links, ["C"]);
    assert!(by_rel(&delta.updated, "writing/new/c.md").is_some());
    assert!(index.search("searching", None, 10).unwrap().is_empty());
    drop(index);

    // reopened: the notes not changed are not read again
    let mut index = WorkspaceIndex::open(&root, &local, Box::new(LocalFs)).unwrap();
    let notes = index.sync().unwrap();
    assert_eq!(notes.len(), 5); // writing, a.md, pic.png, new, new/c.md
    assert_eq!(by_rel(&notes, "writing/a.md").unwrap().parsed.links, ["C"]);
    fs::remove_dir_all(&base).unwrap();
  }

  #[test]
  fn indexes_the_books() {
    let (base, root) = setup("books");
    let mut index = WorkspaceIndex::open(&root, &base.join("local"), Box::new(LocalFs)).unwrap();
    index.sync().unwrap();
    assert!(!index.book_indexed("h1"));
    let section = |cfi: &str, text: &str| BookSection { cfi: cfi.into(), label: "One".into(), text: text.into() };
    index.index_book("h1", "A Book", &[section("/6/2", "whales and the sea"), section("/6/4", "more whales")]).unwrap();
    assert!(index.book_indexed("h1"));
    let hits = index.search("whales", Some("book"), 10).unwrap();
    assert_eq!(hits.len(), 2);
    assert!(hits.iter().all(|h| h.id.starts_with("book:h1#/6/") && h.path.is_empty() && h.title == "A Book"));
    // again: replaced
    index.index_book("h1", "A Book", &[section("/6/2", "the sea only")]).unwrap();
    assert!(index.search("whales", None, 10).unwrap().is_empty());
    fs::remove_dir_all(&base).unwrap();
  }

  #[test]
  fn where_the_index_is() {
    let (base, root) = setup("local");
    assert_eq!(local_dir(&root), None.or(dirs::data_local_dir().map(|d| d.join("mdsilo/index").join(path_key(&root)))));
    fs::write(root.join(".mdsilo/workspace.json"), "{}").unwrap();
    assert_eq!(local_dir(&root), Some(root.join(".mdsilo/local")));
    fs::remove_dir_all(&base).unwrap();
  }
}
