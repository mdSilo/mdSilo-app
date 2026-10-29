//! The file system of a workspace, behind one trait: the local disk on
//! desktop; on mobile, a store the app is granted (Android SAF) can have its
//! own implementation. The index (index/) and the books (books.rs) use it.

use crate::atomic::write_atomic;
use ignore::WalkBuilder;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// An entry of the workspace, as listed or stat-ed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FsEntry {
  pub path: PathBuf,
  pub is_dir: bool,
  pub size: u64,
  /// ms since the epoch
  pub modified: u64,
  /// ms since the epoch; the modified time where the platform has none
  pub created: u64,
}

// the whole interface, for the stores of mobile (B7) too: the desktop does
// not call every method yet
#[allow(dead_code)]
pub trait WorkspaceFs: Send + Sync {
  /// The entries of a dir, hidden ones (`.name`) skipped.
  fn list(&self, dir: &Path) -> std::io::Result<Vec<FsEntry>>;
  /// The entries in a dir and its sub dirs, hidden ones skipped, not
  /// following links.
  fn walk(&self, dir: &Path) -> Vec<FsEntry>;
  fn stat(&self, path: &Path) -> Option<FsEntry>;
  fn read(&self, path: &Path) -> std::io::Result<Vec<u8>>;
  fn read_to_string(&self, path: &Path) -> std::io::Result<String> {
    String::from_utf8(self.read(path)?)
      .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
  }
  /// `len` bytes from `start`, fewer at the end of the file.
  fn read_range(
    &self,
    path: &Path,
    start: u64,
    len: u64,
  ) -> std::io::Result<Vec<u8>>;
  /// Written whole or not at all.
  fn write_atomic(&self, path: &Path, data: &[u8]) -> std::io::Result<()>;
  fn rename(&self, from: &Path, to: &Path) -> std::io::Result<()>;
  fn remove(&self, path: &Path) -> std::io::Result<()>;
}

fn millis(time: std::io::Result<SystemTime>) -> Option<u64> {
  time
    .ok()?
    .duration_since(UNIX_EPOCH)
    .ok()
    .map(|d| d.as_millis() as u64)
}

fn entry_of(path: PathBuf, meta: &fs::Metadata) -> FsEntry {
  let modified = millis(meta.modified()).unwrap_or(0);
  FsEntry {
    path,
    is_dir: meta.is_dir(),
    size: if meta.is_dir() { 0 } else { meta.len() },
    modified,
    created: millis(meta.created()).unwrap_or(modified),
  }
}

/// The local disk.
#[derive(Debug, Default, Clone, Copy)]
pub struct LocalFs;

impl WorkspaceFs for LocalFs {
  fn list(&self, dir: &Path) -> std::io::Result<Vec<FsEntry>> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      if entry.file_name().to_string_lossy().starts_with('.') {
        continue;
      }
      if let Ok(meta) = entry.metadata() {
        entries.push(entry_of(entry.path(), &meta));
      }
    }
    Ok(entries)
  }

  fn walk(&self, dir: &Path) -> Vec<FsEntry> {
    WalkBuilder::new(dir)
      .follow_links(false)
      .git_ignore(false)
      .git_global(false)
      .git_exclude(false)
      .ignore(false)
      .parents(false)
      .hidden(true)
      .build()
      .filter_map(|entry| entry.ok())
      .filter(|entry| entry.depth() > 0)
      .filter_map(|entry| {
        let meta = entry.metadata().ok()?;
        Some(entry_of(entry.into_path(), &meta))
      })
      .collect()
  }

  fn stat(&self, path: &Path) -> Option<FsEntry> {
    let meta = fs::metadata(path).ok()?;
    Some(entry_of(path.to_path_buf(), &meta))
  }

  fn read(&self, path: &Path) -> std::io::Result<Vec<u8>> {
    fs::read(path)
  }

  fn read_range(
    &self,
    path: &Path,
    start: u64,
    len: u64,
  ) -> std::io::Result<Vec<u8>> {
    let mut file = fs::File::open(path)?;
    file.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::new();
    file.take(len).read_to_end(&mut buf)?;
    Ok(buf)
  }

  fn write_atomic(&self, path: &Path, data: &[u8]) -> std::io::Result<()> {
    write_atomic(path, data)
  }

  fn rename(&self, from: &Path, to: &Path) -> std::io::Result<()> {
    if let Some(parent) = to.parent() {
      fs::create_dir_all(parent)?;
    }
    fs::rename(from, to)
  }

  fn remove(&self, path: &Path) -> std::io::Result<()> {
    if fs::symlink_metadata(path)?.is_dir() {
      fs::remove_dir_all(path)
    } else {
      fs::remove_file(path)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn the_local_disk() {
    let dir =
      std::env::temp_dir().join(format!("mdsilo-wsfs-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("sub/.hidden")).unwrap();
    let fs_ = LocalFs;
    fs_.write_atomic(&dir.join("a.md"), b"hello world").unwrap();
    fs_.write_atomic(&dir.join("sub/b.md"), b"b").unwrap();
    fs_
      .write_atomic(&dir.join("sub/.hidden/c.md"), b"c")
      .unwrap();
    fs_.write_atomic(&dir.join(".git"), b"x").unwrap();

    let mut listed: Vec<String> = fs_
      .list(&dir)
      .unwrap()
      .into_iter()
      .map(|e| e.path.file_name().unwrap().to_string_lossy().to_string())
      .collect();
    listed.sort();
    assert_eq!(listed, ["a.md", "sub"]);
    let mut walked: Vec<String> = fs_
      .walk(&dir)
      .into_iter()
      .map(|e| {
        e.path
          .strip_prefix(&dir)
          .unwrap()
          .to_string_lossy()
          .replace('\\', "/")
      })
      .collect();
    walked.sort();
    assert_eq!(walked, ["a.md", "sub", "sub/b.md"]);

    let a = fs_.stat(&dir.join("a.md")).unwrap();
    assert!(!a.is_dir && a.size == 11 && a.modified > 0);
    assert_eq!(fs_.read_range(&dir.join("a.md"), 6, 100).unwrap(), b"world");
    assert_eq!(
      fs_.read_to_string(&dir.join("a.md")).unwrap(),
      "hello world"
    );
    fs_
      .rename(&dir.join("a.md"), &dir.join("moved/a.md"))
      .unwrap();
    assert!(fs_.stat(&dir.join("a.md")).is_none());
    fs_.remove(&dir.join("sub")).unwrap();
    assert!(fs_.stat(&dir.join("sub")).is_none());
    fs::remove_dir_all(&dir).unwrap();
  }
}
