//! The plugins installed on this device, one folder each under
//! `<data>/mdsilo/custom/plugins/<id>`. The manifest is checked by the
//! frontend (src/plugins/manifest.ts); here only the folders are handled.

use crate::storage::data_dir;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const MANIFEST: &str = "manifest.json";

#[derive(Serialize, Debug, PartialEq)]
pub struct PluginFolder {
  pub id: String,
  pub dir: String,
  /// the text of manifest.json, empty if it can't be read
  pub manifest: String,
}

pub(crate) fn plugins_dir() -> Result<PathBuf, String> {
  data_dir()
    .map(|dir| dir.join("custom").join("plugins"))
    .ok_or_else(|| "No data folder".to_string())
}

/// As `ID` in src/plugins/manifest.ts, so an id is always one plain folder name
pub(crate) fn is_valid_id(id: &str) -> bool {
  let mut chars = id.chars();
  matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
    && id.len() <= 64
    && chars
      .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "._-".contains(c))
}

fn list_in(base: &Path) -> Vec<PluginFolder> {
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
        dir: dir.display().to_string(),
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

#[tauri::command]
pub async fn list_plugins() -> Result<Vec<PluginFolder>, String> {
  Ok(list_in(&plugins_dir()?))
}

/// Installs the plugin in the folder `src`, gives the folder it is installed in.
#[tauri::command]
pub async fn install_plugin(src: String, id: String) -> Result<String, String> {
  let base = plugins_dir()?;
  fs::create_dir_all(&base).map_err(|e| e.to_string())?;
  install_in(&base, Path::new(&src), &id)
}

#[tauri::command]
pub async fn remove_plugin(id: String) -> Result<(), String> {
  remove_in(&plugins_dir()?, &id)
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
    let listed = list_in(&base);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "csv");
    assert_eq!(listed[0].manifest, "{\"v\":1}");

    // a new version takes the place of the old one, files of the old one go
    fs::remove_file(src.join("assets/app.js")).unwrap();
    fs::write(src.join(MANIFEST), "{\"v\":2}").unwrap();
    install_in(&base, &src, "csv").unwrap();
    assert_eq!(list_in(&base)[0].manifest, "{\"v\":2}");
    assert!(!base.join("csv/assets/app.js").exists());
    assert_eq!(fs::read_dir(&base).unwrap().count(), 1);

    remove_in(&base, "csv").unwrap();
    assert!(list_in(&base).is_empty());
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

  #[test]
  fn lists_nothing_without_the_folder() {
    assert!(list_in(Path::new("/no/such/folder")).is_empty());
  }
}
