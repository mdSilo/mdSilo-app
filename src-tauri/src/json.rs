use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;
use chrono::{Utc, TimeZone, SecondsFormat};
use async_recursion::async_recursion;
use crate::files::{read_directory, write_file, EventPayload}; 
use crate::storage::get_data;

#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct NoteData {
  id: String,  // !!Important!! id === file_path
  title: String,
  content: String,
  file_path: String,
  cover: String,
  created_at: String,
  updated_at: String,
  is_daily: bool,
  is_dir: bool,
}

pub type NotesData = HashMap<String, NoteData>;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NoteTreeItem {
  id: String,  
  title: String,
  created_at: String,
  updated_at: String,
  is_dir: bool,
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

#[async_recursion]
pub async fn load_dir_recursively(
  dir: &str, 
  notes: &mut NotesData, 
  tree: &mut NoteTree
) {
  // get files
  let dir_data = read_directory(dir).await.unwrap();
  let files = dir_data.files.iter().filter(|f| !f.is_hidden);
  // loop 
  let mut tree_items = Vec::new();
  for file in files {
    let fname = file.file_name.clone();
    let is_dir = file.is_dir;
    let check_md = !is_dir && (fname.ends_with(".md") || fname.ends_with(".txt"));
    if !is_dir && !check_md { continue; }

    let file_title = Path::new(&fname)
      .file_stem()
      .unwrap_or_default()
      .to_owned()
      .into_string()
      .unwrap_or_default();
    let file_path = file.file_path.clone();

    let mod_since_the_epoch = file.last_modified
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_millis();
    let last_mod_date = Utc
      .timestamp_millis(mod_since_the_epoch as i64)
      .to_rfc3339_opts(SecondsFormat::Millis, true);

    let create_since_the_epoch = file.created
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_millis();
    let created_date = Utc
      .timestamp_millis(create_since_the_epoch as i64)
      .to_rfc3339_opts(SecondsFormat::Millis, true);

    let new_note = NoteData {
      id: file_path.clone(),
      title: file_title.clone(),
      content: if is_dir { String::new() } else { file.file_text.clone() },
      created_at: created_date.clone(),
      updated_at: last_mod_date.clone(),
      file_path: file_path.clone(),
      is_dir,
      ..NoteData::default()
    };
    notes.insert(file_path.clone(), new_note);

    let new_tree = NoteTreeItem {
      id: file_path.clone(),
      title: file_title,
      created_at: created_date,
      updated_at: last_mod_date,
      is_dir,
    };
    
    tree_items.push(new_tree);

    if file.is_dir {
      load_dir_recursively(&file_path, notes, tree).await;
    }
  }
  
  tree_items.sort_by(|a, b| (a.id).cmp(&b.id));
  tree_items.dedup_by(|a, b| a.id == b.id);

  tree.insert(dir.to_string(), tree_items);
}


pub async fn load_dir(dir: &str) -> (NotesData, NoteTree) {
  // init data and tree
  let mut notes_data: NotesData = HashMap::new();
  let mut notes_tree: NoteTree = HashMap::new();
  load_dir_recursively(dir, &mut notes_data, &mut notes_tree).await;

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

  println!("loaded dir: {} ? -> {}", dir, res);

  window.emit(
    "changes", 
    EventPayload {
      paths: vec![dir],
      event: if res { String::from("loaded") } else { String::from("unloaded") },
    },
  )
  .unwrap_or(());

  return res;
}
