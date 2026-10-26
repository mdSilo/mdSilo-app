use crate::atomic::{is_self_write, is_temp, write_atomic};
use crate::paths::{PathBufExt, PathExt};
use crate::storage::log_error;
use crate::tree::node::{from_node, Node};
use crate::tree::Tree;
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
  pub number_of_files: usize,
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
        log_error("Err on [get_basename: convert basename OsStr to str]");

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
    Path::new(file_path).normalize_slash().unwrap_or_default()
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

/// The name of the file or dir of the path, without checking it
fn file_name_of(file_path: &str) -> String {
  Path::new(file_path)
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or_default()
    .to_string()
}

/// A time of the metadata, now if the platform does not have it
fn time_or_now(time: std::io::Result<SystemTime>, what: &str) -> SystemTime {
  time.unwrap_or_else(|e| {
    log_error(format!("Error on [get_simple_meta: get file {what}]: {e:?}"));
    SystemTime::now()
  })
}

// get file metadate without content
pub fn get_simple_meta(file_path: &str) -> Result<SimpleFileMeta, String> {
  let metadata = match fs::metadata(file_path) {
    Ok(data) => data,
    Err(e) => {
      log_error(format!("Err on [get_simple_meta: read meatadata]: {:?}", e));
      return Err(format!("Err on read meatadata: {:?}", e));
    }
  };

  let normalized_path = match Path::new(file_path).normalize_slash() {
    Some(normalized) => normalized,
    None => {
      log_error(format!("Err on [get_simple_meta: normalized_path]: {}", file_path));
      return Err(format!("Err on normalize Path: {}", file_path));
    }
  };

  // name.ext
  let file_name = file_name_of(file_path);
  let is_dir = metadata.is_dir();
  let is_file = metadata.is_file();
  let is_hidden = check_hidden_meta(file_path, &metadata);
  let size = metadata.len();
  let readonly = metadata.permissions().readonly();
  let last_modified = time_or_now(metadata.modified(), "modified");
  let last_accessed = time_or_now(metadata.accessed(), "last accessed");
  let created = time_or_now(metadata.created(), "created");

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
      log_error(format!(
          "Error on [get_file_meta: get_simple_meta, {}]: {:?}",
          file_path, e
        ));
      return Err(e);
    }
  };

  // get text if md file
  let file_text = if meta_data.is_file && check_md(file_path) {
    match fs::read_to_string(file_path) {
      Ok(text) => text,
      Err(e) => {
        log_error(format!(
            "Error on [get_file_meta: read_to_string, {}]: {:?}",
            file_path, e
          ));
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
  match fs::metadata(path) {
    Ok(meta) => Ok(meta.is_dir()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
    Err(e) => {
      log_error(format!("Error on [is_dir: fs::metadata]: {:?}", e));
      Ok(false)
    }
  }
}

// Check if a given path is a file
//
// Return false if not exist or it isn't
#[tauri::command]
pub fn is_file(path: &Path) -> Result<bool, String> {
  match fs::metadata(path) {
    Ok(meta) => Ok(meta.is_file()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
    Err(e) => {
      log_error(format!("Error on [is_file: fs::metadata]: {:?}", e));
      Ok(false)
    }
  }
}

// Read files and its information of a directory
#[tauri::command]
pub async fn read_directory(dir: &str) -> Result<FolderData, String> {
  let paths = match fs::read_dir(dir) {
    Ok(res) => res,
    Err(e) => {
      log_error(format!("Error on [read_directory: dir {}]: {:?}", dir, e));
      return Ok(FolderData::default());
    }
  };

  let mut files = Vec::new();

  for path in paths {
    let file_path = match path {
      Ok(p) => p.path().display().to_string(),
      Err(e) => {
        log_error(format!("Error on [read_directory: check path]: {:?}", e));
        continue;
      }
    };

    if let Ok(file) = get_file_meta(&file_path).await {
      files.push(file);
    }
  }

  Ok(FolderData {
    number_of_files: files.len(),
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

// Create a file if it does not exist: an existing one is kept as is
#[tauri::command]
pub async fn create_file(file_path: String) -> bool {
  if let Some(p) = Path::new(&file_path).parent() {
    create_dir_recursive(p.display().to_string()).await;
  }

  fs::OpenOptions::new()
    .write(true)
    .create(true)
    .truncate(false)
    .open(file_path)
    .is_ok()
}

// read file to string
#[tauri::command]
pub async fn read_file(file_path: String) -> String {
  fs::read_to_string(&file_path)
    .map_err(|e| {
      log_error(format!(
          "Error on [read_file: read_to_string, {}]: {:?}",
          file_path, e
        ))
    })
    .unwrap_or_else(|_| String::from("")) // nothing
}

// write to a file
#[tauri::command]
pub async fn write_file(file_path: String, text: String) -> bool {
  write_atomic(Path::new(&file_path), text.as_bytes()).is_ok()
}

#[tauri::command]
pub async fn download_file(file_path: String, blob: Vec<u8>) -> bool {
  write_atomic(Path::new(&file_path), &blob).is_ok()
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

/// The same content, compared without reading the files whole
fn same_content(a: &Path, b: &Path) -> bool {
  use std::io::Read;
  let (Ok(meta_a), Ok(meta_b)) = (fs::metadata(a), fs::metadata(b)) else {
    return false;
  };
  if meta_a.len() != meta_b.len() {
    return false;
  }
  let (Ok(mut file_a), Ok(mut file_b)) = (fs::File::open(a), fs::File::open(b)) else {
    return false;
  };
  let (mut buf_a, mut buf_b) = ([0u8; 8192], [0u8; 8192]);
  loop {
    let Ok(n) = file_a.read(&mut buf_a) else { return false };
    if n == 0 {
      return true;
    }
    if file_b.read_exact(&mut buf_b[..n]).is_err() || buf_a[..n] != buf_b[..n] {
      return false;
    }
  }
}

/// Where to put `src` in `dir`, by its name: (path, already there). Never
/// replace another file: `name-1.ext`, `name-2.ext`... are tried.
fn asset_target(src: &Path, dir: &Path, file_name: &str) -> (std::path::PathBuf, bool) {
  let name = Path::new(file_name);
  let stem = name.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
  let ext = name.extension().and_then(|e| e.to_str());
  let src_real = fs::canonicalize(src).ok();
  let mut i = 0;
  loop {
    let candidate = match (i, ext) {
      (0, _) => dir.join(file_name),
      (_, Some(ext)) => dir.join(format!("{stem}-{i}.{ext}")),
      (_, None) => dir.join(format!("{stem}-{i}")),
    };
    if !candidate.exists() {
      return (candidate, false);
    }
    // the file itself, or a copy of it
    if src_real.is_some() && fs::canonicalize(&candidate).ok() == src_real
      || same_content(src, &candidate)
    {
      return (candidate, true);
    }
    i += 1;
  }
}

// copy the assets(image...) to the `assets` dir of the given work dir
// return (absolute_path, relative_path_to_work_dir), empty on failure
#[tauri::command]
pub async fn copy_file_to_assets(src_path: String, work_dir: String) -> (String, String) {
  let src = Path::new(&src_path);
  if !src.is_file() {
    return (String::new(), String::new());
  }
  let file_name = file_name_of(&src_path);
  let assets = Path::new(&work_dir).join("assets");
  if fs::create_dir_all(&assets).is_err() {
    return (String::new(), String::new());
  }

  let (target, in_place) = asset_target(src, &assets, &file_name);
  let target_name = file_name_of(&target.display().to_string());
  let to_path = target.normalize_slash().unwrap_or_default();
  let relative_to_path = Path::new("./assets")
    .join(&target_name)
    .normalize_slash()
    .unwrap_or_default();

  // copying a file onto itself would empty it
  if in_place || fs::copy(src, &target).is_ok() {
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
  log_error(info);
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
      // not the temp files of atomic writes, nor the files as the app wrote
      // them: the app has their content already
      let paths: Vec<String> = paths
        .iter()
        .map(|path| to_dir_path(path))
        .filter(|path| !is_temp(Path::new(path)) && !is_self_write(Path::new(path)))
        .collect();
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

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::PathBuf;

  fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("mdsilo-files-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  fn s(path: &Path) -> String {
    path.normalize_slash().unwrap()
  }

  #[tokio::test]
  async fn an_asset_never_replaces_another_file() {
    let dir = temp_dir("assets");
    let work = dir.join("work");
    fs::write(dir.join("pic.png"), b"first").unwrap();
    let (abs, rel) = copy_file_to_assets(s(&dir.join("pic.png")), s(&work)).await;
    assert_eq!((abs.as_str(), rel.as_str()), (s(&work.join("assets/pic.png")).as_str(), "./assets/pic.png"));

    // another picture of the same name
    fs::create_dir_all(dir.join("other")).unwrap();
    fs::write(dir.join("other/pic.png"), b"second").unwrap();
    let (abs, rel) = copy_file_to_assets(s(&dir.join("other/pic.png")), s(&work)).await;
    assert_eq!(rel, "./assets/pic-1.png");
    assert_eq!(fs::read(&abs).unwrap(), b"second");
    assert_eq!(fs::read(work.join("assets/pic.png")).unwrap(), b"first");

    // the same picture again: no new copy
    let (_, rel) = copy_file_to_assets(s(&dir.join("other/pic.png")), s(&work)).await;
    assert_eq!(rel, "./assets/pic-1.png");
    assert_eq!(fs::read_dir(work.join("assets")).unwrap().count(), 2);
    fs::remove_dir_all(&dir).unwrap();
  }

  #[tokio::test]
  async fn an_asset_already_in_place_is_kept_as_is() {
    let dir = temp_dir("in-place");
    fs::create_dir_all(dir.join("assets")).unwrap();
    let pic = dir.join("assets/pic.png");
    fs::write(&pic, b"image bytes").unwrap();
    // copied onto itself, it would be emptied
    let (abs, rel) = copy_file_to_assets(s(&pic), s(&dir)).await;
    assert_eq!((abs, rel.as_str()), (s(&pic), "./assets/pic.png"));
    assert_eq!(fs::read(&pic).unwrap(), b"image bytes");
    fs::remove_dir_all(&dir).unwrap();
  }

  #[tokio::test]
  async fn assets_without_extension_and_missing_sources() {
    let dir = temp_dir("no-ext");
    fs::write(dir.join("LICENSE"), b"a").unwrap();
    fs::create_dir_all(dir.join("assets")).unwrap();
    fs::write(dir.join("assets/LICENSE"), b"b").unwrap();
    let (_, rel) = copy_file_to_assets(s(&dir.join("LICENSE")), s(&dir)).await;
    assert_eq!(rel, "./assets/LICENSE-1");
    let missing = copy_file_to_assets(s(&dir.join("nope.png")), s(&dir)).await;
    assert_eq!(missing, (String::new(), String::new()));
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn compares_the_content() {
    let dir = temp_dir("content");
    let (a, b, c) = (dir.join("a"), dir.join("b"), dir.join("c"));
    let big: Vec<u8> = (0..20_000u32).map(|i| (i % 251) as u8).collect();
    fs::write(&a, &big).unwrap();
    fs::write(&b, &big).unwrap();
    let mut other = big.clone();
    other[19_999] ^= 1;
    fs::write(&c, &other).unwrap();
    assert!(same_content(&a, &b));
    assert!(!same_content(&a, &c));
    assert!(!same_content(&a, &dir.join("missing")));
    fs::remove_dir_all(&dir).unwrap();
  }

  #[tokio::test]
  async fn create_file_keeps_an_existing_file() {
    let dir = temp_dir("create");
    let file = dir.join("sub/new.md");
    assert!(create_file(s(&file)).await);
    assert_eq!(fs::read_to_string(&file).unwrap(), "");
    fs::write(&file, "content").unwrap();
    assert!(create_file(s(&file)).await);
    assert_eq!(fs::read_to_string(&file).unwrap(), "content");
    fs::remove_dir_all(&dir).unwrap();
  }

  #[tokio::test]
  async fn reads_a_directory_with_its_count() {
    let dir = temp_dir("read-dir");
    fs::write(dir.join("a.md"), "A").unwrap();
    fs::write(dir.join("b.txt"), "B").unwrap();
    fs::create_dir_all(dir.join("sub")).unwrap();
    let data = read_directory(&s(&dir)).await.unwrap();
    assert_eq!(data.number_of_files, 3);
    let mut texts: Vec<(String, String)> =
      data.files.into_iter().map(|f| (f.file_name, f.file_text)).collect();
    texts.sort();
    assert_eq!(
      texts,
      [("a.md", "A"), ("b.txt", "B"), ("sub", "")].map(|(n, t)| (n.to_string(), t.to_string()))
    );
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn kinds_of_missing_paths() {
    let missing = Path::new("/no/such/mdsilo/path");
    assert!(!is_dir(missing).unwrap());
    assert!(!is_file(missing).unwrap());
    let meta = get_simple_meta(file!());
    assert!(meta.is_err() || meta.unwrap().is_file);
  }
}
