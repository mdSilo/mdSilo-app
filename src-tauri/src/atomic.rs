// Atomic writes, and the writes of the app hidden from the dir watcher.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime};

/// suffix of the temp file written before renaming it to the target
pub const TMP_SUFFIX: &str = ".mdsilo-tmp";

/// how long a write of the app is remembered
const SELF_WRITE_TTL: Duration = Duration::from_secs(60);

/// the files written by the app: path -> (len, modified) as written, and when;
/// modified is None while being written (the watcher may see it before)
type SelfWrites = HashMap<PathBuf, (u64, Option<SystemTime>, Instant)>;
static SELF_WRITES: LazyLock<Mutex<SelfWrites>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));

/// A temp file of `write_atomic`.
pub fn is_temp(path: &Path) -> bool {
  path
    .file_name()
    .and_then(|name| name.to_str())
    .is_some_and(|name| name.ends_with(TMP_SUFFIX))
}

/// Write the file at once: to a temp file in the same dir, then renamed to
/// the path, so a crash never leaves it half written. A symlink is written
/// through, to keep the link.
pub fn write_atomic(path: &Path, data: &[u8]) -> io::Result<()> {
  if let Some(dir) = path.parent() {
    fs::create_dir_all(dir)?;
  }
  let is_link = fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink());
  remember_write(path, data.len() as u64, None);
  if is_link {
    fs::write(path, data)?;
  } else {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let tmp = path.with_file_name(format!(".{}{}", name, TMP_SUFFIX));
    let written = (|| {
      let mut file = File::create(&tmp)?;
      file.write_all(data)?;
      file.sync_all()?;
      // keep the permissions of the file replaced
      if let Ok(meta) = fs::metadata(path) {
        fs::set_permissions(&tmp, meta.permissions())?;
      }
      fs::rename(&tmp, path)
    })();
    if let Err(e) = written {
      let _ = fs::remove_file(&tmp);
      forget_write(path);
      return Err(e);
    }
  }
  match fs::metadata(path) {
    Ok(meta) => remember_write(path, meta.len(), meta.modified().ok()),
    Err(_) => forget_write(path),
  }
  Ok(())
}

fn remember_write(path: &Path, len: u64, modified: Option<SystemTime>) {
  let now = Instant::now();
  if let Ok(mut writes) = SELF_WRITES.lock() {
    writes.retain(|_, (_, _, at)| now.duration_since(*at) < SELF_WRITE_TTL);
    writes.insert(path.to_path_buf(), (len, modified, now));
  }
}

fn forget_write(path: &Path) {
  if let Ok(mut writes) = SELF_WRITES.lock() {
    writes.remove(path);
  }
}

/// The file is as the app wrote it: a change event of it is the app's own.
/// A change by another program afterwards differs in modified time or size.
pub fn is_self_write(path: &Path) -> bool {
  let Ok(writes) = SELF_WRITES.lock() else {
    return false;
  };
  let Some((len, modified, at)) = writes.get(path) else {
    return false;
  };
  if at.elapsed() >= SELF_WRITE_TTL {
    return false;
  }
  fs::metadata(path).is_ok_and(|meta| {
    meta.len() == *len
      && match modified {
        Some(modified) => meta.modified().is_ok_and(|m| m == *modified),
        None => true, // being written
      }
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
      "mdsilo-atomic-{}-{}",
      name,
      std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn writes_replaces_and_leaves_no_temp_file() {
    let dir = temp_dir("write");
    let path = dir.join("sub/a.md");
    write_atomic(&path, b"one").unwrap();
    write_atomic(&path, b"two").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "two");
    let names: Vec<_> = fs::read_dir(path.parent().unwrap())
      .unwrap()
      .map(|e| e.unwrap().file_name())
      .collect();
    assert_eq!(names, vec!["a.md"]);
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn knows_its_own_writes_until_changed_by_others() {
    let dir = temp_dir("self");
    let path = dir.join("a.md");
    assert!(!is_self_write(&path));
    write_atomic(&path, b"mine").unwrap();
    assert!(is_self_write(&path));
    // another program writes it
    fs::write(&path, b"changed by another program").unwrap();
    assert!(!is_self_write(&path));
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn tells_temp_files() {
    assert!(is_temp(Path::new("/w/.a.md.mdsilo-tmp")));
    assert!(!is_temp(Path::new("/w/a.md")));
  }

  #[cfg(unix)]
  #[test]
  fn keeps_symlinks_and_permissions() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let dir = temp_dir("link");
    let target = dir.join("real.md");
    fs::write(&target, b"old").unwrap();
    fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();
    let link = dir.join("link.md");
    symlink(&target, &link).unwrap();
    write_atomic(&link, b"via link").unwrap();
    assert!(
      fs::symlink_metadata(&link)
        .unwrap()
        .file_type()
        .is_symlink()
    );
    assert_eq!(fs::read_to_string(&target).unwrap(), "via link");
    write_atomic(&target, b"direct").unwrap();
    assert_eq!(
      fs::metadata(&target).unwrap().permissions().mode() & 0o777,
      0o600
    );
    fs::remove_dir_all(&dir).unwrap();
  }
}
