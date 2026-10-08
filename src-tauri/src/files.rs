use crate::paths::{PathBufExt, PathExt};
use crate::storage::do_log;
use crate::tree::node::{from_node, Node};
use crate::tree::Tree;
use chrono::offset::Local;
use chrono::DateTime;
use ignore::WalkBuilder;
use notify::{
  event::{EventKind, ModifyKind, RenameMode},
  Config, Event as RawEvent, RecommendedWatcher, RecursiveMode, Watcher,
};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::fs::MetadataExt;

#[derive(serde::Serialize, Clone, Debug)]
pub struct SimpleFileMeta {
  pub file_path: String,
  pub file_name: String,
  // pub file_type: fs::FileType,
  pub created: SystemTime,
  pub last_modified: SystemTime, // locale
  pub last_accessed: SystemTime,
  pub size: u64,
  pub readonly: bool,
  pub is_dir: bool,
  pub is_file: bool,
  pub is_hidden: bool,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct FileMetaData {
  pub file_path: String,
  pub file_name: String,
  // pub file_type: fs::FileType,
  pub file_text: String,
  pub created: SystemTime,
  pub last_modified: SystemTime,
  pub last_accessed: SystemTime,
  pub size: u64,
  pub readonly: bool,
  pub is_dir: bool,
  pub is_file: bool,
  pub is_hidden: bool,
}

#[derive(serde::Serialize, Default)]
pub struct FolderData {
  pub number_of_files: u16,
  pub files: Vec<FileMetaData>,
}

#[derive(serde::Serialize, Clone)]
pub struct EventPayload {
  pub paths: Vec<String>,
  pub event: String,
}

// Check if a file is hidden
#[cfg(windows)]
#[inline]
pub fn check_hidden(file_path: &str) -> bool {
  // reference: https://docs.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileattributesa
  let attributes = if let Ok(attr) = fs::metadata(file_path) {
    attr.file_attributes()
  } else {
    2
  };
  // FILE_ATTRIBUTE_HIDDEN 2 (0x2)
  (attributes & 0x2) > 0
}

#[cfg(unix)]
#[inline]
pub fn check_hidden(file_path: &str) -> bool {
  let basename = get_basename(file_path).0;
  basename.starts_with(".")
}

// Check if a file is hidden, with its metadata already at hand
#[cfg(windows)]
#[inline]
pub fn check_hidden_meta(_file_path: &str, meta: &fs::Metadata) -> bool {
  // FILE_ATTRIBUTE_HIDDEN 2 (0x2), no extra fs::metadata call
  (meta.file_attributes() & 0x2) > 0
}

#[cfg(unix)]
#[inline]
pub fn check_hidden_meta(file_path: &str, _meta: &fs::Metadata) -> bool {
  check_hidden(file_path)
}

#[inline]
pub fn check_md(file_path: &str) -> bool {
  let extension = Path::new(file_path)
    .extension()
    .and_then(|ext| ext.to_str());
  match extension {
    Some(et) => {
      let ext = et.to_lowercase();
      ext == "md" || ext == "markdown" || ext == "text" || ext == "txt"
    }
    None => false,
  }
}

// Get file_name or dir_name of the path given: (name, is_file)
#[tauri::command]
pub fn get_basename(file_path: &str) -> (String, bool) {
  let path = Path::new(file_path);
  let name = path.file_name();
  let is_file = path.is_file();
  if let Some(basename) = name {
    match basename.to_str() {
      Some(n) => return (n.to_string(), is_file),
      None => {
        do_log(
          "Error".to_string(),
          format!("Err on [get_basename: convert basename OsStr to str]"),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );

        return (String::new(), is_file);
      }
    }
  }
  (String::new(), is_file)
}

// get dir path of a dir or file and normalize
#[tauri::command]
pub fn get_dirpath(path: &str) -> String {
  let file_path = path.trim_end_matches(['/', '\\']);
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

// get parent dir path
#[tauri::command]
pub fn get_parent_dir(path: &str) -> String {
  let file_path = path.trim_end_matches(['/', '\\']);
  let path = Path::new(file_path);
  let dir_path = path.parent().unwrap_or(path);
  dir_path.normalize_slash().unwrap_or_default()
}

// join path and normalize
#[tauri::command]
pub fn join_paths(root: &str, parts: Vec<&str>) -> String {
  let mut root_path = Path::new(root.trim_end_matches(['/', '\\'])).to_path_buf();
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

// get file metadate without content
pub fn get_simple_meta(file_path: &str) -> Result<SimpleFileMeta, String> {
  let metadata = match fs::metadata(file_path) {
    Ok(data) => data,
    Err(e) => {
      do_log(
        "Error".to_string(),
        format!("Err on [get_simple_meta: read meatadata]: {:?}", e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      );
      return Err(format!("Err on read meatadata: {:?}", e));
    }
  };

  let normalized_path = match Path::new(file_path).normalize_slash() {
    Some(normalized) => normalized,
    None => {
      do_log(
        "Error".to_string(),
        format!("Err on [get_simple_meta: normalized_path]: {}", file_path),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      );
      return Err(format!("Err on normalize Path: {}", file_path));
    }
  };

  // name.ext
  let file_name = get_basename(file_path).0;
  // let file_type = metadata.file_type();
  let is_dir = metadata.is_dir();
  let is_file = metadata.is_file();
  let is_hidden = check_hidden(file_path);
  let size = metadata.len();
  let readonly = metadata.permissions().readonly();

  let last_modified = match metadata.modified() {
    Ok(result) => result,
    Err(e) => {
      let now = SystemTime::now();
      let datetime: DateTime<Local> = now.into();
      do_log(
        "Error".to_string(),
        format!("Error on [get_simple_meta: get file modified]: {:?}", e),
        format!("{}", datetime.format("%m/%d/%Y %H:%M:%S")),
      );
      now
    }
  };

  let last_accessed = match metadata.accessed() {
    Ok(result) => result,
    Err(e) => {
      let now = SystemTime::now();
      let datetime: DateTime<Local> = now.into();
      do_log(
        "Error".to_string(),
        format!(
          "Error on [get_simple_meta: get file last accessed]: {:?}",
          e
        ),
        format!("{}", datetime.format("%m/%d/%Y %H:%M:%S")),
      );
      now
    }
  };

  let created = match metadata.created() {
    Ok(result) => result,
    Err(e) => {
      let now = SystemTime::now();
      let datetime: DateTime<Local> = now.into();
      do_log(
        "Error".to_string(),
        format!("Error on [get_simple_meta: get file created]: {:?}", e),
        format!("{}", datetime.format("%m/%d/%Y %H:%M:%S")),
      );
      now
    }
  };

  Ok(SimpleFileMeta {
    file_path: normalized_path,
    file_name,
    // file_type,
    created,
    last_modified,
    last_accessed,
    size,
    readonly,
    is_dir,
    is_file,
    is_hidden,
  })
}

// Get meatdata of a file
#[tauri::command]
pub async fn get_file_meta(file_path: &str) -> Result<FileMetaData, String> {
  let meta_data = match get_simple_meta(file_path) {
    Ok(data) => data,
    Err(e) => {
      do_log(
        "Error".to_string(),
        format!(
          "Error on [get_file_meta: get_simple_meta, {}]: {:?}",
          file_path, e
        ),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      );
      return Err(e);
    }
  };

  // get text if md file
  let file_text = if meta_data.is_file && check_md(file_path) {
    match fs::read_to_string(file_path) {
      Ok(text) => text,
      Err(e) => {
        do_log(
          "Error".to_string(),
          format!(
            "Error on [get_file_meta: read_to_string, {}]: {:?}",
            file_path, e
          ),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );
        String::new()
      }
    }
  } else {
    String::new()
  };

  Ok(FileMetaData {
    file_path: meta_data.file_path,
    file_name: meta_data.file_name,
    // file_type: meta_data.file_type,
    file_text,
    created: meta_data.created,
    last_modified: meta_data.last_modified,
    last_accessed: meta_data.last_accessed,
    size: meta_data.size,
    readonly: meta_data.readonly,
    is_dir: meta_data.is_dir,
    is_file: meta_data.is_file,
    is_hidden: meta_data.is_hidden,
  })
}

// Check if a given path is a directory
//
// Return false if not exist or it isn't a directory
#[tauri::command]
pub fn is_dir(path: &Path) -> Result<bool, String> {
  if !Path::new(path).exists() {
    Ok(false)
  } else {
    match fs::metadata(path) {
      Ok(meta) => Ok(meta.is_dir()),
      Err(e) => {
        do_log(
          "Error".to_string(),
          format!("Error on [is_dir: fs::metadata]: {:?}", e),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );
        Ok(false)
      }
    }
  }
}

// Check if a given path is a file
//
// Return false if not exist or it isn't
#[tauri::command]
pub fn is_file(path: &Path) -> Result<bool, String> {
  if !Path::new(path).exists() {
    Ok(false)
  } else {
    match fs::metadata(path) {
      Ok(meta) => Ok(meta.is_file()),
      Err(e) => {
        do_log(
          "Error".to_string(),
          format!("Error on [is_file: fs::metadata]: {:?}", e),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );
        Ok(false)
      }
    }
  }
}

// Read files and its information of a directory
#[tauri::command]
pub async fn read_directory(dir: &str) -> Result<FolderData, String> {
  let paths = match fs::read_dir(dir) {
    Ok(res) => res,
    Err(e) => {
      do_log(
        "Error".to_string(),
        format!("Error on [read_directory: dir {}]: {:?}", dir, e),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      );
      return Ok(FolderData::default());
    }
  };

  let mut number_of_files: u16 = 0;
  let mut files = Vec::new();

  for path in paths {
    let file_path = match path {
      Ok(p) => p.path().display().to_string(),
      Err(e) => {
        do_log(
          "Error".to_string(),
          format!("Error on [read_directory: check path]: {:?}", e),
          format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
        );
        continue;
      }
    };

    let file_info = get_file_meta(&file_path).await;
    if let Ok(file) = file_info {
      files.push(file);
      number_of_files += 1;
    } else {
      continue;
    }
  }

  // println!("num: {}, files: {:?}", number_of_files, files);

  Ok(FolderData {
    number_of_files,
    files,
  })
}

// Read files and its information of a directory resursively
pub fn read_dir(dir: &str) -> Result<Tree, String> {
  Tree::init(dir, None, true)
}

// Get array of files of a directory
#[tauri::command]
pub async fn list_directory(dir: &str) -> Result<Vec<FileMetaData>, String> {
  Ok(list_dir_entries(dir))
}

// List the direct children of a directory, w/o content.
// Walk the single level sequentially: the parallel Tree traversal (threads,
// channel, arena) costs more than it saves here, see list_directory bench.
// Same filters as the Tree walker: hidden skipped, .gitignore not applied.
pub fn list_dir_entries(dir: &str) -> Vec<FileMetaData> {
  let root = match fs::canonicalize(dir) {
    Ok(root) => root,
    Err(_) => return vec![],
  };

  WalkBuilder::new(root)
    .max_depth(Some(1))
    .follow_links(false)
    .git_ignore(false)
    .hidden(true)
    .build()
    .filter_map(|entry| entry.ok())
    .filter(|entry| entry.depth() == 1)
    .filter_map(|entry| from_node(&Node::from((&entry, false))))
    .collect()
}

// Check if path given exists
#[tauri::command]
pub fn file_exist(file_path: &str) -> bool {
  fs::metadata(file_path).is_ok()
}

// Create directory recursively
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

// Create a file
#[tauri::command]
pub async fn create_file(file_path: String) -> bool {
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::write(file_path, "").is_ok()
}

// read file to string
#[tauri::command]
pub async fn read_file(file_path: String) -> String {
  fs::read_to_string(&file_path)
    .map_err(|e| {
      do_log(
        "Error".to_string(),
        format!(
          "Error on [read_file: read_to_string, {}]: {:?}",
          file_path, e
        ),
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
      )
    })
    .unwrap_or_else(|_| String::from("")) // nothing
}

// write to a file
#[tauri::command]
pub async fn write_file(file_path: String, text: String) -> bool {
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::write(file_path, text).is_ok()
}

#[tauri::command]
pub async fn download_file(file_path: String, blob: Vec<u8>) -> bool {
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }
  fs::write(&file_path, blob).is_ok()
}

// rename the file
#[tauri::command]
pub async fn rename_file(from_path: String, to_path: String) -> bool {
  fs::rename(from_path, to_path).is_ok()
}

// copy the file
#[tauri::command]
pub async fn copy_file(src_path: String, to_path: String) -> bool {
  if let Some(p) = Path::new(&to_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::copy(src_path, to_path).is_ok()
}

// copy the assets(image...) to given work dir
// return (absolute_path, relative_path_to_work_dir )
#[tauri::command]
pub async fn copy_file_to_assets(
  src_path: String,
  work_dir: String,
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

  let relative_to_path = Path::new("./assets")
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

// Delete files or dirs
// note: will not delete dir if any file in dir on Linux
#[tauri::command]
pub async fn delete_files(paths: Vec<String>) -> bool {
  trash::delete_all(paths).is_ok()
}

#[tauri::command]
pub fn detect_lang(text: String) -> String {
  match whatlang::detect(&text) {
    Some(info) => info.lang().to_string(),
    None => "".to_string(),
  }
}

// Only one directory is watched at a time. Watching again, e.g. after the
// page is reloaded or another folder is opened, replaces the previous watcher,
// which is dropped and so stops.
static DIR_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

fn log_watch_err(info: String) {
  do_log(
    "Error".to_string(),
    info,
    format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S")),
  );
}

// Listen to change events in a directory, emit them to the window.
// It returns once watching: the events are handled on the watcher's thread,
// never block a thread of the async runtime, otherwise the commands
// invoked later would hang once all the threads are blocked.
#[tauri::command]
pub async fn listen_dir(
  dir: String,
  window: tauri::Window,
) -> Result<String, String> {
  // stop the previous watcher first
  unlisten_dir();

  // FSEvents (macOS) reports the resolved paths, e.g. /private/var/.. for
  // /var/.., map them back to the dir as opened, which the notes are keyed by.
  // Other watchers report the paths under the dir as watched already.
  let real_dir = cfg!(target_os = "macos")
    .then(|| fs::canonicalize(&dir).ok())
    .flatten()
    .filter(|real| real.as_path() != Path::new(&dir));
  let dir_path = Path::new(&dir).to_path_buf();
  let to_dir_path = move |path: &Path| -> String {
    let path = match &real_dir {
      Some(real) => match path.strip_prefix(real) {
        Ok(rest) => dir_path.join(rest),
        Err(_) => path.to_path_buf(),
      },
      None => path.to_path_buf(),
    };
    path.normalize_slash().unwrap_or_default()
  };

  let emit = move |event: &str, paths: Vec<String>| {
    // emit event here, then Frontend will listen the event.
    // frontend: src/file/directory.ts/DirectoryAPI/listen
    if paths.is_empty() {
      return;
    }
    window
      .emit(
        "changes",
        EventPayload {
          paths,
          event: event.to_string(),
        },
      )
      .unwrap_or(());
  };

  let handler = move |res: notify::Result<RawEvent>| match res {
    Ok(RawEvent {
      paths,  // Vec<PathBuff>
      kind,   // EventKind: Access,Create,Modify,Remove
      ..      // attrs,  // EventAttributes: tracker, flag...
    }) => {
      let paths: Vec<String> = paths.iter().map(|path| to_dir_path(path)).collect();
      match kind {
        // EventKind::Access(_) => "access",
        EventKind::Create(_) => emit("create", paths),
        EventKind::Modify(ModifyKind::Name(rename)) => match rename {
          RenameMode::To => emit("renameTo", paths),
          RenameMode::From => emit("renameFrom", paths),
          // [from, to] of a rename already reported by From and To, on Linux
          RenameMode::Both => {}
          // FSEvents (macOS) cannot tell the old path from the new one of a
          // rename: the path is the new one if it exists, the old one if not
          _ => {
            let (to, from): (Vec<String>, Vec<String>) =
              paths.into_iter().partition(|path| Path::new(path).exists());
            emit("renameFrom", from);
            emit("renameTo", to);
          }
        },
        EventKind::Modify(_) => emit("write", paths),
        EventKind::Remove(_) => emit("remove", paths),
        _ => {}
      }
    }
    Err(e) => log_watch_err(format!("error on [listen_dir: receive event]: {}", e)),
  };

  let mut watcher = RecommendedWatcher::new(handler, Config::default()).map_err(|e| {
    log_watch_err(format!("Err on [listen_dir: new watcher] : {}", e));
    format!("new watcher err: {}", e)
  })?;
  watcher
    .watch(dir.as_ref(), RecursiveMode::Recursive)
    .map_err(|e| {
      log_watch_err(format!("Err on [listen_dir: watch]: {}", e));
      format!("watch err: {}", e)
    })?;

  match DIR_WATCHER.lock() {
    Ok(mut current) => {
      current.replace(watcher);
      Ok(dir)
    }
    Err(e) => {
      log_watch_err(format!("Err on [listen_dir: lock watcher]: {}", e));
      Err(format!("lock watcher on listen err: {}", e))
    }
  }
}

// Stop watching the directory, if any
pub fn unlisten_dir() {
  if let Ok(mut current) = DIR_WATCHER.lock() {
    current.take();
  }
}

// opn url with default application(like: web browser)
#[tauri::command]
pub fn open_url(url: String) -> bool {
  open::that(url).is_ok()
}

#[tauri::command]
pub fn open_link(_app: AppHandle, url: String) {
  open::that(url).unwrap_or(());
}

/// watch event as a bridge from injected script to frontend via invoke()
// workflow: 
// - can invoke() in inject scripts 
// - listen emited event and handle on frontend: 
//   src/file/directory.ts/DirectoryAPI/listen
#[tauri::command]
pub async fn watch_event(
  id: String, 
  ev: String,
  window: tauri::Window,
) {
  // println!("watch: {ev}, {id}");
  window.emit(
    "changes",
    EventPayload {
      paths: vec![id],
      event: ev,
    },
  )
  .unwrap_or(());
}
