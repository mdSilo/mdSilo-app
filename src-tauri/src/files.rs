use std::fs;
use std::path::Path;
use std::time::SystemTime;
extern crate notify;
extern crate trash;
use notify::{raw_watcher, RawEvent, RecursiveMode, Watcher};
use std::sync::mpsc::channel;

#[derive(serde::Serialize, Clone, Debug)]
pub struct FileMetaData {
  file_path: String,
  file_name: String,
  //file_type: String,
  file_text: String,
  size: u64,
  readonly: bool,
  is_dir: bool,
  is_file: bool,
  last_modified: SystemTime,
  last_accessed: SystemTime,
  created: SystemTime,
}

#[derive(serde::Serialize)]
pub struct FolderData {
  number_of_files: u16,
  files: Vec<FileMetaData>,
}

#[derive(serde::Serialize, Clone)]
pub struct Event {
  pub path: String,
  pub event: String,
}

/// Get file_name of the path given
pub fn get_basename(file_path: &str) -> String {
  let name = Path::new(file_path).file_name();
  match name {
    Some(name) => name.to_str().unwrap_or(file_path).to_string(),
    None => file_path.to_string(),
  }
}

/// Get properties of a file
#[tauri::command]
pub async fn get_file_meta(file_path: &str) -> Result<FileMetaData, String> {
  let metadata = match fs::metadata(file_path) {
    Ok(data) => data,
    Err(e) => return Err(e.to_string()),
  };

  let file_name = get_basename(file_path);
  //let file_type = metadata.file_type();
  let is_dir = metadata.is_dir();
  let is_file = metadata.is_file();
  let size = metadata.len();
  let readonly = metadata.permissions().readonly();

  let file_text = fs::read_to_string(file_path)
    .unwrap_or(format!("{}: Something went wrong", file_path));

  let last_modified = match metadata.modified() {
    Ok(result) => result,
    Err(_e) => SystemTime::now(), // TODO: to log the err
  };

  let last_accessed = match metadata.accessed() {
    Ok(result) => result,
    Err(_e) => SystemTime::now(), // TODO: to log the err
  };

  let created = match metadata.created() {
    Ok(result) => result,
    Err(_e) => SystemTime::now(), // TODO: to log the err
  };
  
  Ok(FileMetaData {
    file_path: file_path.to_string(),
    file_name,
    file_text,
    is_dir,
    is_file,
    size,
    readonly,
    last_modified,
    last_accessed,
    created,
  })
}

/// Check if a given path is a directory
///
/// Return false if file does not exist or it isn't a directory
#[tauri::command]
pub fn is_dir(path: &Path) -> Result<bool, String> {
  if !Path::new(path).exists() {
    Ok(false)
  } else {
    match fs::metadata(path) {
      Ok(meta) => Ok(meta.is_dir()),
      Err(_e) => Ok(false),
    }
  }
}

/// Read files and its information of a directory
#[tauri::command]
pub async fn read_directory(dir: &str) -> Result<FolderData, String> {
  let paths = fs::read_dir(dir).map_err(|err| err.to_string())?;

  let mut number_of_files: u16 = 0;
  let mut files = Vec::new();

  for path in paths {
    let file_path = match path {
      Ok(p) => p.path().display().to_string(),
      Err(_e) => continue,
    };

    let file_info = get_file_meta(&file_path).await;
    if let Ok(file) = file_info {
      files.push(file);
      number_of_files += 1;
    } else {
      continue;
    }
  }

  Ok(FolderData {
    number_of_files,
    files,
  })
}

/// Get array of files of a directory
#[tauri::command]
pub async fn list_directory(dir: &str) -> Result<Vec<String>, String> {
  let paths = fs::read_dir(dir).map_err(|err| err.to_string())?;
  let mut filepaths = Vec::new();
  for path in paths {
    let file_path = match path {
      Ok(p) => p.path().display().to_string(),
      Err(_e) => continue,
    };

    filepaths.push(file_path);
  }
  Ok(filepaths)
}

/// Check if path given exists
#[tauri::command]
pub fn file_exist(file_path: &str) -> bool {
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
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::write(file_path, "").is_ok()
}

/// write to a file
#[tauri::command]
pub async fn write_file(file_path: String, text: String) -> bool {
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::write(file_path, text).is_ok()
}


/// Delete a file 
#[tauri::command]
pub async fn delete_files(paths: Vec<String>) -> bool {
  trash::delete_all(paths).is_ok()
}

/// Listen to change events in a directory
#[tauri::command]
pub async fn listen_dir(
  dir: String, 
  window: tauri::Window
) -> Result<String, String> {
  let (tx, rx) = channel();

  let watcher = std::sync::Arc::new(
    std::sync::Mutex::new(raw_watcher(tx).unwrap())
  );

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
      },
      Ok(event) => println!("broken event: {:?}", event),
      Err(e) => break Err(e.to_string()),
    }
  }
}
