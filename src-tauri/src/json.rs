use std::collections::HashMap;
// use crate::db;
use crate::files::read_dir;
use crate::tree::assemble_note_tree;
// use crate::models::Note;

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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NoteTreeItem {
  pub id: String,
  pub title: String,
  pub created_at: String,
  pub updated_at: String,
  pub is_dir: bool,
}

pub type NoteTree = HashMap<String, Vec<NoteTreeItem>>;

pub async fn load_dir(dir: &str) -> (NotesData, NoteTree) {
  // init data and tree
  let mut notes_data: NotesData = HashMap::new();
  let mut notes_tree: NoteTree = HashMap::new();
  // load_dir_recursively(dir, &mut notes_data, &mut notes_tree).await;
  if let Ok(tree) = read_dir(dir) {
    let root = tree.root;
    let inner = tree.inner();
    assemble_note_tree(root, inner, &mut notes_data, &mut notes_tree);
  }

  return (notes_data, notes_tree);
}

/// All the notes in the dir and its sub-dirs, with content.
/// Returned directly: no snapshot written into the dir and read back.
#[tauri::command]
pub async fn load_notes(dir: String) -> NotesData {
  load_dir(&dir).await.0
}

// #[tauri::command]
// pub async fn save_notes(dir: String, content: String) -> usize {

//   let data = Note {
//     id: dir,
//     content,
//     saved: Utc::now().to_string(),
//   };

//   db::save_notes(data)
// }

// #[tauri::command]
// pub async fn get_notes(dir: String) -> Option<Note> {
//   db::get_notes_by_id(dir)
// }
