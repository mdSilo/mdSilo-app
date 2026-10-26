use crate::files::{read_dir, FileMetaData};
use chrono::{SecondsFormat, TimeZone, Utc};
use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct NoteData {
  pub id: String, // !!Important!! id === file_path
  pub title: String,
  pub content: String,
  pub file_path: String,
  pub cover: String,
  pub created_at: String,
  pub updated_at: String,
  pub is_daily: bool,
  pub is_dir: bool,
}

pub type NotesData = HashMap<String, NoteData>;

/// RFC 3339 in UTC with milliseconds, as the frontend dates
fn to_rfc3339(time: SystemTime) -> String {
  let millis = time.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
  Utc
    .timestamp_millis_opt(millis as i64)
    .earliest()
    .unwrap_or_else(Utc::now)
    .to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// The note of a file or dir: titled by its name without extension.
pub fn note_data(file: FileMetaData) -> NoteData {
  let title = Path::new(&file.file_name)
    .file_stem()
    .and_then(|stem| stem.to_str())
    .unwrap_or_default()
    .to_string();
  NoteData {
    id: file.file_path.clone(),
    title,
    content: if file.is_dir { String::new() } else { file.file_text },
    file_path: file.file_path,
    created_at: to_rfc3339(file.created),
    updated_at: to_rfc3339(file.last_modified),
    is_dir: file.is_dir,
    ..NoteData::default()
  }
}

/// All the notes in the dir and its sub-dirs, with content, by path.
pub fn load_notes_in(dir: &str) -> NotesData {
  match read_dir(dir) {
    Ok(tree) => tree
      .into_files()
      .into_iter()
      .map(|file| (file.file_path.clone(), note_data(file)))
      .collect(),
    Err(_) => HashMap::new(),
  }
}

/// All the notes in the dir and its sub-dirs, with content.
/// Returned directly: no snapshot written into the dir and read back.
#[tauri::command]
pub async fn load_notes(dir: String) -> NotesData {
  // walking and reading the whole dir blocks: not on a thread of the async
  // runtime, which the other commands need meanwhile
  tauri::async_runtime::spawn_blocking(move || load_notes_in(&dir))
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::paths::PathExt;
  use std::fs;

  #[test]
  fn loads_the_notes_of_the_dir_and_sub_dirs() {
    let dir = std::env::temp_dir().join(format!("mdsilo-load-notes-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("sub/deeper")).unwrap();
    fs::create_dir_all(dir.join(".hidden")).unwrap();
    fs::write(dir.join("a.md"), "# A").unwrap();
    fs::write(dir.join("sub/b.markdown"), "b text").unwrap();
    fs::write(dir.join("sub/deeper/c.md"), "").unwrap();
    fs::write(dir.join("sub/pic.png"), [0u8, 1, 2]).unwrap();
    fs::write(dir.join(".hidden/h.md"), "hidden").unwrap();
    fs::write(dir.join(".h.md"), "hidden").unwrap();

    let root = fs::canonicalize(&dir).unwrap();
    let path = |rel: &str| root.join(rel).normalize_slash().unwrap();
    let notes = load_notes_in(dir.to_str().unwrap());

    let mut paths: Vec<&String> = notes.keys().collect();
    paths.sort();
    let expected = ["a.md", "sub", "sub/b.markdown", "sub/deeper", "sub/deeper/c.md", "sub/pic.png"]
      .map(path);
    assert_eq!(paths, expected.iter().collect::<Vec<_>>());

    let a = &notes[&path("a.md")];
    assert_eq!((a.id.as_str(), a.title.as_str(), a.content.as_str()), (path("a.md").as_str(), "a", "# A"));
    assert!(!a.is_dir);
    assert!(a.updated_at.ends_with('Z') && a.created_at.ends_with('Z'));
    assert_eq!(notes[&path("sub/b.markdown")].content, "b text");
    assert_eq!(notes[&path("sub/b.markdown")].title, "b");
    // only the text files are read
    assert_eq!(notes[&path("sub/pic.png")].content, "");
    let sub = &notes[&path("sub")];
    assert!(sub.is_dir);
    assert_eq!(sub.title, "sub");

    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn no_notes_of_a_missing_dir() {
    assert!(load_notes_in("/no/such/mdsilo/dir").is_empty());
  }

  #[test]
  fn dates_in_rfc3339_utc_millis() {
    let time = UNIX_EPOCH + std::time::Duration::from_millis(1_700_000_000_123);
    assert_eq!(to_rfc3339(time), "2023-11-14T22:13:20.123Z");
  }
}

