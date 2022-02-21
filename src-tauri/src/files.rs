use std::fs;
use std::path::Path;
use std::time::SystemTime;
extern crate notify;
extern crate trash;
use glob::{glob_with, MatchOptions};
use notify::{raw_watcher, RawEvent, RecursiveMode, Watcher};
use std::sync::mpsc::channel;

#[derive(serde::Serialize, Clone, Debug)]
pub struct FileMetaData {
  file_path: String,
  basename: String,
  //file_type: String,
  is_dir: bool,
  is_file: bool,
  size: u64,
  readonly: bool,
  last_modified: SystemTime,
  last_accessed: SystemTime,
  created: SystemTime,
}

#[derive(serde::Serialize)]
pub struct FolderInformation {
  number_of_files: u16,
  files: Vec<FileMetaData>,
}

#[derive(serde::Serialize, Clone)]
pub struct Event {
  pub path: String,
  pub event: String,
}

/// Get basename of the path given
pub fn get_basename(file_path: String) -> String {
  let basename = Path::new(&file_path).file_name();
  match basename {
    Some(basename) => basename.to_str().unwrap().to_string(),
    None => file_path,
  }
}

/// Get properties of a file
#[tauri::command]
pub async fn get_file_properties(file_path: String) -> Result<FileMetaData, String> {
  let metadata = fs::metadata(file_path.clone());
  let metadata = match metadata {
    Ok(result) => result,
    Err(e) => return Err(e.to_string()),
  };
  let is_dir = metadata.is_dir();
  let is_file = metadata.is_file();
  let size = metadata.len();
  let readonly = metadata.permissions().readonly();
  let last_modified = metadata.modified();
  let last_modified = match last_modified {
    Ok(result) => result,
    Err(e) => return Err(e.to_string()),
  };
  let last_accessed = metadata.accessed();
  let last_accessed = match last_accessed {
    Ok(result) => result,
    Err(e) => return Err(e.to_string()),
  };
  let created = metadata.created();
  let created = match created {
    Ok(result) => result,
    Err(e) => return Err(e.to_string()),
  };
  let basename = get_basename(file_path.clone());

  Ok(FileMetaData {
    is_dir,
    is_file,
    size,
    readonly,
    last_modified,
    last_accessed,
    created,
    file_path,
    basename,
  })
}

/// Get size of a directory
///
/// Get size of a directory by iterating and summing up the size of all files
#[tauri::command]
pub async fn get_dir_size(dir: String) -> u64 {
  let mut total_size: u64 = 0;
  let mut stack = vec![dir];
  while let Some(path) = stack.pop() {
    let entry = fs::read_dir(path);
    let entry = match entry {
      Ok(result) => result,
      Err(_) => continue,
    };
    for file in entry {
      let file = file.unwrap();
      let metadata = file.metadata().unwrap();
      if metadata.is_dir() {
        stack.push(file.path().to_str().unwrap().to_string());
      } else {
        total_size += metadata.len();
      }
    }
  }
  total_size
}

#[tauri::command]
pub async fn get_file_meta_data(file_path: String) -> Result<FileMetaData, String> {
  let properties = get_file_properties(file_path).await;
  if properties.is_err() {
    Err("Error reading meta data".into())
  } else {
    Ok(properties.unwrap())
  }
}

/// Check if a given path is a directory
///
/// Return false if file does not exist or it isn't a directory
#[tauri::command]
pub fn is_dir(path: &Path) -> Result<bool, String> {
  if !Path::new(path).exists() {
    Ok(false)
  } else {
    let md = fs::metadata(path).unwrap();
    Ok(md.is_dir())
  }
}

/// Read files and its information of a directory
#[tauri::command]
pub async fn read_directory(dir: &Path) -> Result<FolderInformation, String> {
  let paths = fs::read_dir(dir).map_err(|err| err.to_string())?;
  let mut number_of_files: u16 = 0;
  let mut files = Vec::new();
  let mut skipped_files = Vec::new();
  for path in paths {
    number_of_files += 1;
    let file_path = path.unwrap().path().display().to_string();
    let file_info = get_file_properties(file_path.clone()).await;
    if file_info.is_err() {
      skipped_files.push(file_path);
      continue;
    } else {
      let file_info = file_info.unwrap();
      files.push(file_info);
    };
  }
  Ok(FolderInformation {
    number_of_files,
    files,
  })
}

/// Get array of files of a directory
#[tauri::command]
pub async fn get_files_in_directory(dir: &Path) -> Result<Vec<String>, String> {
  let paths = fs::read_dir(dir).map_err(|err| err.to_string())?;
  let mut files = Vec::new();
  for path in paths {
    files.push(path.unwrap().path().display().to_string());
  }
  Ok(files)
}

/// Check if path given exists
#[tauri::command]
pub fn file_exist(file_path: String) -> bool {
  fs::metadata(file_path).is_ok()
}

/// Create directory recursively
#[tauri::command]
pub async fn create_dir_recursive(dir_path: String) -> bool {
  fs::create_dir_all(dir_path).is_ok()
}

// File operations: 
// create
// rename
// write
// delete

/// Create a file
#[tauri::command]
pub async fn create_file(file_path: String) -> bool {
  let parent_dir = Path::new(&file_path)
    .parent()
    .unwrap()
    .to_str()
    .unwrap()
    .to_string();
  create_dir_recursive(parent_dir).await;
  fs::write(file_path, "").is_ok()
}

/// Delete a file 
#[tauri::command]
pub async fn delete_file(paths: Vec<String>) -> bool {
  trash::delete_all(paths).is_ok()
}

/// Listen to change events of a directory
#[tauri::command]
pub async fn listen_dir(dir: String, window: tauri::Window) -> Result<String, String> {
  let (tx, rx) = channel();

  let watcher = std::sync::Arc::new(std::sync::Mutex::new(raw_watcher(tx).unwrap()));

  watcher
    .lock()
    .unwrap()
    .watch(dir.clone(), RecursiveMode::NonRecursive)
    .unwrap();

  window.once("unlisten_dir", move |_| {
    watcher.lock().unwrap().unwatch(dir.clone()).unwrap();
  });
  loop {
    match rx.recv() {
      Ok(RawEvent {
        path: Some(path),
        op: Ok(op),
        ..
      }) => {
        //window.emit("changes", path.to_str().unwrap().to_string());
        let event: String;
        if op.contains(notify::op::CREATE) {
          event = "create".to_string();
        } else if op.contains(notify::op::REMOVE) {
          event = "remove".to_string();
        } else if op.contains(notify::op::RENAME) {
          event = "rename".to_string();
        } else if op.contains(notify::op::WRITE) {
          event = "write".to_string();
        } else if op.contains(notify::op::CLOSE_WRITE) {
          event = "close_write".to_string();
        }else {
          event = "unknown".to_string();
        }
        if event != "unknown" {
          window
            .emit(
              "changes",
              Event {
                path: path.to_str().unwrap().to_string(),
                event: event,
              },
            )
            .unwrap();
        }
      }
      Ok(event) => println!("broken event: {:?}", event),
      Err(e) => break Err(e.to_string()),
    }
  }
}

/// Calculate total size of given array of files
#[tauri::command]
pub async fn calculate_files_total_size(files: Vec<String>) -> u64 {
  let mut total_size: u64 = 0;
  for file in files {
    let metadata = fs::metadata(file.clone()).unwrap();
    if metadata.is_dir() {
      total_size += get_dir_size(file).await;
    }
    total_size += metadata.len();
  }
  total_size
}

/// Search for glob matches inside a given directory path
#[tauri::command]
pub async fn search_in_dir(
  dir_path: String,
  pattern: String,
  window: tauri::Window,
) -> Vec<FileMetaData> {
  let glob_pattern = match dir_path.as_ref() {
    "xplorer://Home" => match cfg!(target_os = "windows") {
      true => "C://**/".to_string() + &pattern,
      false => "~/**/".to_string() + &pattern,
    },
    _ => format!("{}/**/{}", dir_path, pattern),
  };
  let glob_option = MatchOptions {
    case_sensitive: false,
    require_literal_separator: false,
    require_literal_leading_dot: false,
    ..Default::default()
  };
  let continue_search = std::sync::Arc::new(std::sync::Mutex::new(true));
  let id = window.listen("unsearch", {
    let continue_search = continue_search.clone();
    move |_| {
      *continue_search.lock().unwrap() = false;
    }
  });
  let mut files = Vec::new();
  let glob_result = glob_with(&glob_pattern, glob_option).unwrap();
  for entry in glob_result {
    if continue_search.lock().unwrap().clone() {
      match entry {
        Ok(path) => {
          files.push(
            get_file_properties(path.to_str().unwrap().to_string())
              .await
              .unwrap(),
          );
          if files.len() % 100 == 0 {
            window.emit("search_partial_result", files.clone()).unwrap();
            files.clear();
          }
        }
        Err(e) => println!("{:?}", e),
      }
    } else {
      break;
    }
  }
  window.unlisten(id);
  files
}
