use std::fs;
use std::path::Path;
use std::sync::mpsc::channel;
use std::time::SystemTime;
extern crate notify;
extern crate open;
extern crate trash;
use crate::paths::{PathBufExt, PathExt};
use notify::{raw_watcher, RawEvent, RecursiveMode, Watcher};

#[derive(serde::Serialize, Clone, Debug)]
pub struct SimpleFileMeta {
  file_name: String,
  file_path: String,
  created: SystemTime,
  last_modified: SystemTime,
  last_accessed: SystemTime,
  size: u64,
  readonly: bool,
  is_dir: bool,
  is_file: bool,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct FileMetaData {
  file_path: String,
  file_name: String,
  //file_type: String,
  file_text: String,
  created: SystemTime,
  last_modified: SystemTime,
  last_accessed: SystemTime,
  size: u64,
  readonly: bool,
  is_dir: bool,
  is_file: bool,
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

/// Get file_name or dir_name of the path given
pub fn get_basename(file_path: &str) -> (String, bool) {
  let path = Path::new(file_path);
  let name = path.file_name();
  let is_file = path.is_file();
  if let Some(basename) = name {
    match basename.to_str() {
      // TODO: handle err
      Some(n) => return (n.to_string(), is_file),
      None => return (String::new(), is_file),
    }
  }
  (String::new(), is_file)
}

// get dir path of a dir or file and normalize
#[tauri::command]
pub fn get_dirpath(path: &str) -> String {
  let file_path = path.trim_end_matches('/');
  let path = Path::new(file_path);
  let is_dir = path.is_dir();
  let is_file = path.is_file();
  if is_dir {
    return Path::new(file_path).normalize_slash().unwrap_or_default();
  } else if is_file {
    let dir_path = path.parent().unwrap_or(path);
    dir_path.normalize_slash().unwrap_or_default()
  } else {
    String::new()
  }
}

// join path and normalize
#[tauri::command]
pub fn join_paths(root: &str, parts: Vec<&str>) -> String {
  let mut root_path = 
    Path::new(root.trim_end_matches(['/', '\\'])).to_path_buf();
  if parts.is_empty() {
    return root_path.normalize_slash().unwrap_or_default();
  }

  for part in parts {
    let trim_part = part
      .trim_start_matches(['/', '\\'])
      .trim_end_matches(['/', '\\']);
    if trim_part.is_empty() {
      continue;
    }
    root_path = root_path.join(trim_part);
  }

  root_path.normalize_slash().unwrap_or_default()
}

pub fn get_simple_meta(file_path: &str) -> Result<SimpleFileMeta, String> {
  let metadata = match fs::metadata(file_path) {
    Ok(data) => data,
    Err(e) => return Err(e.to_string()),
  };

  // name.ext
  let file_name = get_basename(file_path).0;
  //let file_type = metadata.file_type();
  let is_dir = metadata.is_dir();
  let is_file = metadata.is_file();
  let size = metadata.len();
  let readonly = metadata.permissions().readonly();

  let last_modified = match metadata.modified() {
    Ok(result) => result,
    Err(_e) => SystemTime::now(), // TODO: to log the err
  };

  let last_accessed = match metadata.accessed() {
    Ok(result) => result,
    Err(_e) => SystemTime::now(), // TODO: to log the err, unit
  };

  let created = match metadata.created() {
    Ok(result) => result,
    Err(_e) => SystemTime::now(), // TODO: to log the err
  };

  let normalized_path = Path::new(file_path)
    .normalize_slash()
    .unwrap_or(file_path.to_string()); // fallback on raw file_path, potential issue

  Ok(SimpleFileMeta {
    file_path: normalized_path,
    file_name,
    created,
    last_modified,
    last_accessed,
    is_dir,
    is_file,
    size,
    readonly,
  })
}

/// Get meatdata of a file
#[tauri::command]
pub async fn get_file_meta(file_path: &str) -> Result<FileMetaData, String> {
  let meta_data = match get_simple_meta(file_path) {
    Ok(data) => data,
    Err(e) => return Err(e),
  };

  let file_text = fs::read_to_string(file_path)
    .unwrap_or(format!("{}: Something wrong", file_path));

  Ok(FileMetaData {
    file_path: meta_data.file_path,
    file_name: meta_data.file_name,
    file_text,
    created: meta_data.created,
    last_modified: meta_data.last_modified,
    last_accessed: meta_data.last_accessed,
    is_dir: meta_data.is_dir,
    is_file: meta_data.is_file,
    size: meta_data.size,
    readonly: meta_data.readonly,
  })
}

/// Check if a given path is a directory
///
/// Return false if not exist or it isn't a directory
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

/// Check if a given path is a file
///
/// Return false if not exist or it isn't
#[tauri::command]
pub fn is_file(path: &Path) -> Result<bool, String> {
  if !Path::new(path).exists() {
    Ok(false)
  } else {
    match fs::metadata(path) {
      Ok(meta) => Ok(meta.is_file()),
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
pub async fn list_directory(dir: &str) -> Result<Vec<SimpleFileMeta>, String> {
  let paths = fs::read_dir(dir).map_err(|err| err.to_string())?;
  let mut filemetas = Vec::new();
  for path in paths {
    let file_path = match path {
      Ok(p) => p.path().display().to_string(),
      Err(_e) => continue,
    };

    let simple_meta = match get_simple_meta(&file_path) {
      Ok(data) => data,
      Err(_) => continue,
    };

    filemetas.push(simple_meta);
  }
  Ok(filemetas)
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
// copy
// delete

/// Create a file
#[tauri::command]
pub async fn create_file(file_path: String) -> bool {
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::write(file_path, "").is_ok()
}

/// read file to string
#[tauri::command]
pub async fn read_file(file_path: String) -> String {
  // TODO: handle err
  fs::read_to_string(file_path).unwrap_or(String::from("Nothing"))
}

/// write to a file
#[tauri::command]
pub async fn write_file(file_path: String, text: String) -> bool {
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::write(file_path, text).is_ok()
}

/// copy the assets(image...)
#[tauri::command]
pub async fn copy_file(src_path: String, to_path: String) -> bool {
  if let Some(p) = Path::new(&to_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::copy(src_path, to_path).is_ok()
}

/// copy the assets(image...) to given work dir
#[tauri::command]
pub async fn copy_file_to_assets(
  src_path: String, 
  work_dir: String
) -> (String, String) {
  let basename = get_basename(&src_path);
  let is_file = basename.1;
  if !is_file {
    return (String::new(), String::new());
  }

  let file_name = basename.0;
  let to_path = Path::new(&work_dir)
    .join("assets")
    .join(&file_name)
    .normalize_slash()
    .unwrap_or_default();
  
  let relative_to_path = Path::new("$DIR$/assets")
    .join(&file_name)
    .normalize_slash()
    .unwrap_or_default();

  if to_path.is_empty() {
    return (to_path, relative_to_path);
  }

  if let Some(p) = Path::new(&to_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  if fs::copy(src_path, to_path.clone()).is_ok() {
    (to_path, relative_to_path)
  } else {
    (String::new(), String::new())
  }
}

/// Delete files or dirs
/// note: will not delete dir if any file in dir on Linux
#[tauri::command]
pub async fn delete_files(paths: Vec<String>) -> bool {
  trash::delete_all(paths).is_ok()
}

/// Listen to change events in a directory
#[tauri::command]
pub async fn listen_dir(
  dir: String,
  window: tauri::Window,
) -> Result<String, String> {
  let (tx, rx) = channel();

  let raw_watch = match raw_watcher(tx) {
    Ok(watch) => watch,
    Err(e) => return Err(format!("new watcher err: {}", e)),
  };
  let watcher = std::sync::Arc::new(
    std::sync::Mutex::new(raw_watch)
  );

  match watcher.lock() {
    Ok(mut mutex_watch) => {
      mutex_watch.watch(dir.clone(), RecursiveMode::Recursive).unwrap_or(());
    },
    Err(e) => return Err(format!("lock watcher on listen err: {}", e)),
  };

  window.once("unlisten_dir", move |_| {
    if let Ok(mut watch) = watcher.lock() {
      watch.unwatch(dir.clone()).unwrap_or(());
    }
  });

  loop {
    match rx.recv() {
      Ok(RawEvent {
        path: Some(path),
        op: Ok(op),
        .. // cookie: Some(cookie),
      }) => {
        // println!("event, path: {:?}, op: {:?}, cookie: {}", path, op, cookie);
        let event = 
          if op.contains(notify::op::CREATE) {
            "create"
          } else if op.contains(notify::op::REMOVE) {
             "remove"
          } else if op.contains(notify::op::RENAME) {
            "rename"
          } else if op.contains(notify::op::WRITE) {
            "write"
          } else if op.contains(notify::op::CLOSE_WRITE) {
            "close_write"
          } else {
            "unknown"
          };
        
        if event != "unknown" {
          window
            .emit(
              "changes", // then Frontend listen the event changes.
              Event {
                path: path.normalize_slash().unwrap_or_default(),
                event: event.to_string(),
              },
            )
            .unwrap_or(());
        }
      }
      Ok(event) => println!("Broken Event: {:?}", event),
      Err(e) => break Err(e.to_string()),
    }
  }
}

/// opn url with default web browser
#[tauri::command]
pub fn open_url(url: String) -> bool {
  open::that(url).is_ok()
}
