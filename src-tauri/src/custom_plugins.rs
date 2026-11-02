//! The plugins installed, one folder each: on this device under
//! `<data>/mdsilo/custom/plugins/<id>`, or in the workspace (synced) under
//! `.mdsilo/plugins/<id>`. When a plugin is in both, the one of this device
//! is used. The manifest is checked by the frontend (src/plugins/manifest.ts);
//! here only the folders are handled.

use crate::books::hex;
use crate::storage::data_dir;
use md5::{Digest, Md5};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, mpsc};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const MANIFEST: &str = "manifest.json";

#[derive(Serialize, Debug, PartialEq)]
pub struct PluginFolder {
  pub id: String,
  pub dir: String,
  /// the text of manifest.json, empty if it can't be read
  pub manifest: String,
  /// "device" or "workspace"
  #[serde(rename = "where")]
  pub place: &'static str,
  /// of the files of a plugin in the workspace, to see when a sync changed
  /// it; empty for a plugin of this device
  pub hash: String,
}

pub(crate) fn plugins_dir() -> Result<PathBuf, String> {
  data_dir()
    .map(|dir| dir.join("custom").join("plugins"))
    .ok_or_else(|| "No data folder".to_string())
}

/// The plugins of the workspace whose data folder (`.mdsilo`) is `data`
fn workspace_plugins_dir(data: &str) -> PathBuf {
  Path::new(data).join("plugins")
}

/// Where to put or find a plugin: in the workspace if its data folder is given
fn base_of(workspace: Option<&str>) -> Result<PathBuf, String> {
  match workspace {
    Some(data) => Ok(workspace_plugins_dir(data)),
    None => plugins_dir(),
  }
}

/// The folder of each plugin listed last, for the scheme to serve
static SERVED: LazyLock<Mutex<HashMap<String, PathBuf>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));

/// The folder that holds the plugin `id`, as listed last (see `list_plugins`)
pub(crate) fn base_of_plugin(id: &str) -> Option<PathBuf> {
  let served = SERVED.lock().ok()?.get(id).cloned();
  served.or_else(|| plugins_dir().ok())
}

/// As `ID` in src/plugins/manifest.ts, so an id is always one plain folder name
pub(crate) fn is_valid_id(id: &str) -> bool {
  let mut chars = id.chars();
  matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
    && id.len() <= 64
    && chars
      .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "._-".contains(c))
}

/// The files of a folder, by their path in it, sorted; links are left out
fn files_of(dir: &Path, prefix: &str, files: &mut Vec<(String, PathBuf)>) {
  let Ok(entries) = fs::read_dir(dir) else {
    return;
  };
  for entry in entries.flatten() {
    let Ok(file_type) = entry.file_type() else {
      continue;
    };
    let name = entry.file_name().to_string_lossy().to_string();
    let path = format!("{prefix}{name}");
    if file_type.is_dir() {
      files_of(&entry.path(), &format!("{path}/"), files);
    } else if file_type.is_file() {
      files.push((path, entry.path()));
    }
  }
}

/// The settings an Obsidian plugin saves itself (`saveData`), not its code
const DATA_FILE: &str = "data.json";

/// The MD5 of the paths and contents of the files of a folder, but its settings
pub(crate) fn hash_dir(dir: &Path) -> String {
  let mut files = Vec::new();
  files_of(dir, "", &mut files);
  files.retain(|(path, _)| path != DATA_FILE);
  files.sort();
  let mut hasher = Md5::new();
  for (path, file) in files {
    hasher.update(path.as_bytes());
    hasher.update([0]);
    hasher.update(fs::read(file).unwrap_or_default());
    hasher.update([0]);
  }
  hex(&hasher.finalize())
}

fn list_in(base: &Path, place: &'static str) -> Vec<PluginFolder> {
  let Ok(entries) = fs::read_dir(base) else {
    return Vec::new();
  };
  let mut plugins: Vec<PluginFolder> = entries
    .flatten()
    .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
    .filter_map(|entry| {
      let id = entry.file_name().to_str()?.to_string();
      // what is left of an install that didn't finish
      if !is_valid_id(&id) {
        return None;
      }
      let dir = entry.path();
      Some(PluginFolder {
        id,
        manifest: fs::read_to_string(dir.join(MANIFEST)).unwrap_or_default(),
        hash: if place == "workspace" {
          hash_dir(&dir)
        } else {
          String::new()
        },
        dir: dir.display().to_string(),
        place,
      })
    })
    .collect();
  plugins.sort_by(|a, b| a.id.cmp(&b.id));
  plugins
}

/// Copies the files of a folder; links are left out, not to copy what is outside.
fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
  fs::create_dir_all(to)?;
  for entry in fs::read_dir(from)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    let target = to.join(entry.file_name());
    if file_type.is_dir() {
      copy_dir(&entry.path(), &target)?;
    } else if file_type.is_file() {
      fs::copy(entry.path(), target)?;
    }
  }
  Ok(())
}

/// Copies the folder to `<base>/<id>`, in place of the version there:
/// first beside it, so a failed copy leaves the old one as it was.
fn install_in(base: &Path, src: &Path, id: &str) -> Result<String, String> {
  if !is_valid_id(id) {
    return Err(format!("Not a plugin id: {id}"));
  }
  if !src.join(MANIFEST).is_file() {
    return Err(format!("No {MANIFEST} in {}", src.display()));
  }
  let target = base.join(id);
  let src_real = src.canonicalize().map_err(|e| e.to_string())?;
  if let Ok(base_real) = base.canonicalize()
    && src_real.starts_with(&base_real)
  {
    return Err("The plugin is installed already".to_string());
  }
  let staging = base.join(format!(".{id}.new"));
  let _ = fs::remove_dir_all(&staging);
  if let Err(e) = copy_dir(&src_real, &staging) {
    let _ = fs::remove_dir_all(&staging);
    return Err(e.to_string());
  }
  let old = base.join(format!(".{id}.old"));
  let _ = fs::remove_dir_all(&old);
  if target.exists() {
    fs::rename(&target, &old).map_err(|e| e.to_string())?;
  }
  if let Err(e) = fs::rename(&staging, &target) {
    let _ = fs::rename(&old, &target);
    return Err(e.to_string());
  }
  let _ = fs::remove_dir_all(&old);
  Ok(target.display().to_string())
}

fn remove_in(base: &Path, id: &str) -> Result<(), String> {
  if !is_valid_id(id) {
    return Err(format!("Not a plugin id: {id}"));
  }
  let target = base.join(id);
  if target.exists() {
    fs::remove_dir_all(target).map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// The plugins of this device, then those of the workspace not on this device
fn list_all(device: &Path, workspace: Option<&Path>) -> Vec<PluginFolder> {
  let mut plugins = list_in(device, "device");
  if let Some(workspace) = workspace {
    let theirs: Vec<_> = list_in(workspace, "workspace")
      .into_iter()
      .filter(|p| !plugins.iter().any(|d| d.id == p.id))
      .collect();
    plugins.extend(theirs);
  }
  plugins
}

/// The plugins installed, of this device and of the workspace whose data
/// folder is `workspace`; the scheme serves them from where they are listed.
#[tauri::command]
pub async fn list_plugins(
  workspace: Option<String>,
) -> Result<Vec<PluginFolder>, String> {
  let device = plugins_dir()?;
  let plugins = list_all(
    &device,
    workspace.as_deref().map(workspace_plugins_dir).as_deref(),
  );
  if let Ok(mut served) = SERVED.lock() {
    *served = plugins
      .iter()
      .filter_map(|p| {
        Some((p.id.clone(), Path::new(&p.dir).parent()?.to_path_buf()))
      })
      .collect();
  }
  Ok(plugins)
}

/// Installs the plugin in the folder `src`, on this device or in the
/// workspace whose data folder is `workspace`; gives the folder it is in.
#[tauri::command]
pub async fn install_plugin(
  src: String,
  id: String,
  workspace: Option<String>,
) -> Result<String, String> {
  let base = base_of(workspace.as_deref())?;
  fs::create_dir_all(&base).map_err(|e| e.to_string())?;
  install_in(&base, Path::new(&src), &id)
}

#[tauri::command]
pub async fn remove_plugin(
  id: String,
  workspace: Option<String>,
) -> Result<(), String> {
  remove_in(&base_of(workspace.as_deref())?, &id)
}

/// Plugins in development: the watcher of the folder each is installed from
static DEV_WATCHERS: LazyLock<Mutex<HashMap<String, notify::RecommendedWatcher>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));

/// How long the files of a plugin in development must stay still before it
/// is installed again: an editor or a build writes several files in a row
const DEV_QUIET: Duration = Duration::from_millis(300);

#[derive(Serialize, Clone)]
struct DevReload {
  id: String,
  /// why it could not be installed again, empty if it was
  error: String,
}

/// Calls `again` once the events sent to `rx` pause for `quiet`, until the
/// sender is dropped (then not for the events left).
fn on_quiet(rx: mpsc::Receiver<()>, quiet: Duration, again: impl Fn()) {
  while rx.recv().is_ok() {
    loop {
      match rx.recv_timeout(quiet) {
        Ok(()) => continue,
        Err(mpsc::RecvTimeoutError::Timeout) => break,
        // not watched any more
        Err(mpsc::RecvTimeoutError::Disconnected) => return,
      }
    }
    again();
  }
}

/// Watches the folder `src` the plugin `id` (of this device) was installed
/// from: when its files change, installs it again and emits `plugin-dev`
/// `{ id, error }` for the app to reload it. Watching again replaces the
/// watcher of the plugin.
#[tauri::command]
pub async fn watch_plugin_dev(
  id: String,
  src: String,
  app: AppHandle,
) -> Result<(), String> {
  use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
  if !is_valid_id(&id) {
    return Err(format!("Not a plugin id: {id}"));
  }
  if !Path::new(&src).join(MANIFEST).is_file() {
    return Err(format!("No {MANIFEST} in {src}"));
  }
  let (tx, rx) = mpsc::channel();
  let mut watcher = RecommendedWatcher::new(
    move |res: notify::Result<notify::Event>| {
      if let Ok(event) = res
        && matches!(
          event.kind,
          EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
        )
      {
        let _ = tx.send(());
      }
    },
    Config::default(),
  )
  .map_err(|e| e.to_string())?;
  watcher
    .watch(Path::new(&src), RecursiveMode::Recursive)
    .map_err(|e| e.to_string())?;
  let (plugin, folder) = (id.clone(), PathBuf::from(&src));
  std::thread::spawn(move || {
    on_quiet(rx, DEV_QUIET, || {
      let error = plugins_dir()
        .and_then(|base| install_in(&base, &folder, &plugin))
        .err()
        .unwrap_or_default();
      let _ = app.emit(
        "plugin-dev",
        DevReload {
          id: plugin.clone(),
          error,
        },
      );
    });
  });
  // the old watcher dropped: its thread ends
  DEV_WATCHERS
    .lock()
    .map_err(|e| e.to_string())?
    .insert(id, watcher);
  Ok(())
}

#[tauri::command]
pub async fn unwatch_plugin_dev(id: String) -> Result<(), String> {
  DEV_WATCHERS.lock().map_err(|e| e.to_string())?.remove(&id);
  Ok(())
}

/// The most files and bytes a plugin .zip may unpack to
const ZIP_MAX_FILES: usize = 5_000;
const ZIP_MAX_BYTES: u64 = 256 * 1024 * 1024;

/// Unpacks a .zip into `to`; names out of it (`..`, absolute) and links are
/// left out, and it stops past the limits above.
fn unpack_zip(zip: &Path, to: &Path) -> Result<(), String> {
  use std::io::Read;
  let file = fs::File::open(zip).map_err(|e| e.to_string())?;
  let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
  if archive.len() > ZIP_MAX_FILES {
    return Err("Too many files in the .zip".to_string());
  }
  let mut total = 0u64;
  for i in 0..archive.len() {
    let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
    let Some(name) = entry.enclosed_name() else {
      continue;
    };
    if entry.is_symlink() {
      continue;
    }
    let target = to.join(name);
    if entry.is_dir() {
      fs::create_dir_all(&target).map_err(|e| e.to_string())?;
      continue;
    }
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut out = fs::File::create(&target).map_err(|e| e.to_string())?;
    // counted as written, not as the .zip says
    let left = ZIP_MAX_BYTES - total;
    let written = std::io::copy(&mut (&mut entry).take(left + 1), &mut out)
      .map_err(|e| e.to_string())?;
    total += written;
    if total > ZIP_MAX_BYTES {
      return Err("The .zip is too big for a plugin".to_string());
    }
  }
  Ok(())
}

/// The folder of the plugin in what a .zip unpacked to: the root, or its
/// only folder (a .zip of the plugin folder itself)
fn plugin_root(dir: &Path) -> Option<PathBuf> {
  if dir.join(MANIFEST).is_file() {
    return Some(dir.to_path_buf());
  }
  let entries: Vec<_> = fs::read_dir(dir)
    .ok()?
    .flatten()
    .filter(|e| !e.file_name().to_string_lossy().starts_with("__MACOSX"))
    .collect();
  match entries.as_slice() {
    [only] if only.file_type().is_ok_and(|t| t.is_dir()) => {
      let inner = only.path();
      inner.join(MANIFEST).is_file().then_some(inner)
    }
    _ => None,
  }
}

fn unpacked_dir() -> Result<PathBuf, String> {
  data_dir()
    .map(|dir| dir.join("custom").join("unpacked"))
    .ok_or_else(|| "No data folder".to_string())
}

/// Unpacks a plugin .zip, to install from the folder given; then
/// `forget_unpacked` removes it.
#[tauri::command]
pub async fn unpack_plugin(zip: String) -> Result<String, String> {
  let base = unpacked_dir()?;
  let _ = fs::remove_dir_all(&base);
  let dir = base.join("plugin");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let unpacked = unpack_zip(Path::new(&zip), &dir).and_then(|()| {
    plugin_root(&dir).ok_or_else(|| format!("No {MANIFEST} in the .zip"))
  });
  match unpacked {
    Ok(root) => Ok(root.display().to_string()),
    Err(e) => {
      let _ = fs::remove_dir_all(&base);
      Err(e)
    }
  }
}

#[tauri::command]
pub async fn forget_unpacked() -> Result<(), String> {
  let base = unpacked_dir()?;
  if base.exists() {
    fs::remove_dir_all(base).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir()
      .join(format!("mdsilo-plugins-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  fn plugin(dir: &Path, manifest: &str) {
    fs::create_dir_all(dir.join("assets")).unwrap();
    fs::write(dir.join(MANIFEST), manifest).unwrap();
    fs::write(dir.join("index.html"), "<p>hi</p>").unwrap();
    fs::write(dir.join("assets/app.js"), "1").unwrap();
  }

  #[test]
  fn ids_are_plain_names() {
    assert!(is_valid_id("csv-viewer"));
    assert!(is_valid_id("a.b_c"));
    assert!(!is_valid_id(""));
    assert!(!is_valid_id(".hidden"));
    assert!(!is_valid_id("../x"));
    assert!(!is_valid_id("a/b"));
    assert!(!is_valid_id("Big"));
    assert!(!is_valid_id(&"a".repeat(65)));
  }

  #[test]
  fn installs_lists_and_removes() {
    let root = temp("install");
    let (src, base) = (root.join("src"), root.join("plugins"));
    plugin(&src, "{\"v\":1}");
    fs::create_dir_all(&base).unwrap();

    let dir = install_in(&base, &src, "csv").unwrap();
    assert_eq!(
      fs::read_to_string(Path::new(&dir).join("assets/app.js")).unwrap(),
      "1"
    );
    let listed = list_in(&base, "device");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "csv");
    assert_eq!(listed[0].manifest, "{\"v\":1}");

    // a new version takes the place of the old one, files of the old one go
    fs::remove_file(src.join("assets/app.js")).unwrap();
    fs::write(src.join(MANIFEST), "{\"v\":2}").unwrap();
    install_in(&base, &src, "csv").unwrap();
    assert_eq!(list_in(&base, "device")[0].manifest, "{\"v\":2}");
    assert!(!base.join("csv/assets/app.js").exists());
    assert_eq!(fs::read_dir(&base).unwrap().count(), 1);

    remove_in(&base, "csv").unwrap();
    assert!(list_in(&base, "device").is_empty());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn refuses_what_is_not_a_plugin() {
    let root = temp("refuse");
    let base = root.join("plugins");
    fs::create_dir_all(root.join("empty")).unwrap();
    fs::create_dir_all(&base).unwrap();
    assert!(install_in(&base, &root.join("empty"), "x").is_err());
    plugin(&root.join("src"), "{}");
    assert!(install_in(&base, &root.join("src"), "../x").is_err());
    assert!(remove_in(&base, "..").is_err());
    // from the folder of the plugins itself
    install_in(&base, &root.join("src"), "x").unwrap();
    assert!(install_in(&base, &base.join("x"), "x").is_err());
    assert!(base.join("x/index.html").exists());
    let _ = fs::remove_dir_all(root);
  }

  fn zip_of(path: &Path, files: &[(&str, &str)]) {
    use std::io::Write;
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    let options = zip::write::SimpleFileOptions::default()
      .compression_method(zip::CompressionMethod::Deflated);
    for (name, text) in files {
      zip.start_file(*name, options).unwrap();
      zip.write_all(text.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
  }

  #[test]
  fn unpacks_a_zip_of_a_plugin() {
    let root = temp("zip");
    let at_root = root.join("a.zip");
    zip_of(&at_root, &[(MANIFEST, "{}"), ("js/app.js", "1")]);
    let out = root.join("a");
    unpack_zip(&at_root, &out).unwrap();
    assert_eq!(plugin_root(&out), Some(out.clone()));
    assert_eq!(fs::read_to_string(out.join("js/app.js")).unwrap(), "1");

    // a .zip of the folder, as made by the file manager of macOS too
    let folder = root.join("b.zip");
    zip_of(
      &folder,
      &[("csv/manifest.json", "{}"), ("__MACOSX/csv/._x", "")],
    );
    let out = root.join("b");
    unpack_zip(&folder, &out).unwrap();
    assert_eq!(plugin_root(&out), Some(out.join("csv")));

    let none = root.join("c.zip");
    zip_of(&none, &[("a/manifest.json", "{}"), ("b/x", "")]);
    let out = root.join("c");
    unpack_zip(&none, &out).unwrap();
    assert_eq!(plugin_root(&out), None);
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn unpacks_nothing_out_of_the_folder() {
    let root = temp("zipslip");
    let evil = root.join("evil.zip");
    zip_of(
      &evil,
      &[("../out.txt", "no"), ("/abs.txt", "no"), (MANIFEST, "{}")],
    );
    let out = root.join("in");
    unpack_zip(&evil, &out).unwrap();
    assert!(!root.join("out.txt").exists());
    assert!(!Path::new("/abs.txt").exists());
    assert!(out.join(MANIFEST).exists());
    // `..` left out; an absolute name is put inside the folder
    let mut names: Vec<_> = fs::read_dir(&out)
      .unwrap()
      .map(|e| e.unwrap().file_name().into_string().unwrap())
      .collect();
    names.sort();
    assert_eq!(names, ["abs.txt", MANIFEST]);
    assert!(unpack_zip(&root.join("none.zip"), &out).is_err());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn lists_nothing_without_the_folder() {
    assert!(list_in(Path::new("/no/such/folder"), "device").is_empty());
  }

  #[test]
  fn lists_the_workspace_after_the_device() {
    let root = temp("both");
    let (device, ws) = (root.join("device"), root.join("ws"));
    plugin(&device.join("a"), "{\"v\":\"device\"}");
    plugin(&ws.join("a"), "{\"v\":\"ws\"}");
    plugin(&ws.join("b"), "{}");
    let listed = list_all(&device, Some(&ws));
    let ids: Vec<_> = listed.iter().map(|p| (p.id.as_str(), p.place)).collect();
    assert_eq!(ids, [("a", "device"), ("b", "workspace")]);
    // the copy of this device is used
    assert_eq!(listed[0].manifest, "{\"v\":\"device\"}");
    assert!(listed[0].hash.is_empty());
    assert_eq!(listed[1].hash.len(), 32);
    assert_eq!(list_all(&device, None).len(), 1);
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn hashes_change_with_the_files() {
    let root = temp("hash");
    let dir = root.join("p");
    plugin(&dir, "{}");
    let first = hash_dir(&dir);
    assert_eq!(first, hash_dir(&dir));
    fs::write(dir.join("assets/app.js"), "2").unwrap();
    let edited = hash_dir(&dir);
    assert_ne!(first, edited);
    // a file renamed is a change too
    fs::rename(dir.join("assets/app.js"), dir.join("assets/other.js")).unwrap();
    let renamed = hash_dir(&dir);
    assert_ne!(edited, renamed);
    // its own settings are not a change of its code
    fs::write(dir.join(DATA_FILE), "{}").unwrap();
    assert_eq!(renamed, hash_dir(&dir));
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn installs_again_once_the_changes_pause() {
    let (tx, rx) = mpsc::channel();
    let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = count.clone();
    let worker = std::thread::spawn(move || {
      on_quiet(rx, Duration::from_millis(50), || {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
      })
    });
    for _ in 0..5 {
      tx.send(()).unwrap();
    }
    std::thread::sleep(Duration::from_millis(200));
    tx.send(()).unwrap();
    std::thread::sleep(Duration::from_millis(200));
    drop(tx);
    worker.join().unwrap();
    assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 2);
  }

  #[test]
  fn moves_between_device_and_workspace() {
    let root = temp("move");
    let (src, device, ws) = (root.join("src"), root.join("device"), root.join("ws"));
    plugin(&src, "{}");
    fs::create_dir_all(&device).unwrap();
    fs::create_dir_all(&ws).unwrap();
    let dir = install_in(&device, &src, "p").unwrap();
    install_in(&ws, Path::new(&dir), "p").unwrap();
    remove_in(&device, "p").unwrap();
    let listed = list_all(&device, Some(&ws));
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].place, "workspace");
    assert!(ws.join("p/assets/app.js").exists());
    let _ = fs::remove_dir_all(root);
  }
}
