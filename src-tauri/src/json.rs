use std::collections::HashMap;
// use crate::db;
use crate::files::{read_dir, write_file, EventPayload};
use crate::storage::get_data;
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ActivityData {
  activity_num: u32,
  create_num: u32,
  update_num: u32,
}

pub type ActivityRecord = HashMap<String, ActivityData>;

#[derive(serde::Serialize, Clone, Debug)]
pub struct JsonData {
  isloaded: bool,
  notesobj: NotesData,
  notetree: NoteTree,
  activities: ActivityRecord,
}

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

// get activity in storage
pub fn get_activity_data() -> ActivityRecord {
  let store_data = get_data(String::from("activities")).unwrap_or_default();
  let data = store_data.data;
  let activities: ActivityRecord = serde_json::from_value(data).unwrap_or_default();

  return activities;
}

#[tauri::command]
pub async fn write_json(dir: String, window: tauri::Window) -> bool {
  let notes_data = load_dir(&dir).await;
  let activity = get_activity_data();
  let data = JsonData {
    isloaded: true,
    notesobj: notes_data.0,
    notetree: notes_data.1,
    activities: activity,
  };

  let json = serde_json::to_string(&data).unwrap_or_default();
  let to_dir = format!("{}/mdsilo.json", dir);
  let res = write_file(to_dir, json).await;

  // println!("loaded dir: {} ? -> {}", dir, res);
  
  // read files and write to json on rust end, emit event;
  // listen loaded event on ts end, then load to store
  // frontend: src/file/directory.ts/DirectoryAPI/listen
  window
    .emit(
      "changes",
      EventPayload {
        paths: vec![dir],
        event: if res {
          String::from("loaded")
        } else {
          String::from("unloaded")
        },
      },
    )
    .unwrap_or(());

  return res;
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
