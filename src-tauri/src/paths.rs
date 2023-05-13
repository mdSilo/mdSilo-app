// code modified from  https://github.com/rhysd/path-slash
// MIT License Copyright (c) 2018 rhysd

use std::path::{Path, PathBuf, MAIN_SEPARATOR};
#[cfg(windows)]
use std::path::{Component, Prefix};

pub trait PathExt {
  fn normalize_slash(&self) -> Option<String>;
}

impl PathExt for Path {
  // Convert the file path into slash(`/`) path as UTF-8 string.
  //
  // Any file path separators is replaced with '/'.
  // Return None if the path contains non-Unicode sequence.
  //
  // On non-Windows OS, it is equivalent to `.to_str().map(str::to_string)`
  //
  #[cfg(not(target_os = "windows"))]
  fn normalize_slash(&self) -> Option<String> {
    self.to_str().map(str::to_string)
  }

  #[cfg(target_os = "windows")]
  fn normalize_slash(&self) -> Option<String> {
    let is_safe_to_strip = is_safe_to_strip_prefix(self);
    let mut buf = String::new();
    let mut has_trailing_slash = false;
    for c in self.components() {
      match c {
        Component::RootDir => { /* empty */ }
        Component::CurDir => buf.push('.'),
        Component::ParentDir => buf.push_str(".."),
        Component::Prefix(ref prefix) => {
          if let Some(s) = prefix.as_os_str().to_str() {
            buf.push_str(s);
            // C:\foo is [Prefix, RootDir, Normal]. Avoid C://
            continue;
          } else {
            return None;
          }
        }
        Component::Normal(ref s) => {
          if let Some(s) = s.to_str() {
            buf.push_str(s);
          } else {
            return None;
          }
        }
      }
      buf.push('/');
      has_trailing_slash = true;
    }

    if buf != "/" && has_trailing_slash {
      buf.pop(); // Pop last '/'
    }

    // strip "\\?\"
    let final_buf = if buf.starts_with(r#"\\?\"#) && is_safe_to_strip {
      buf.strip_prefix(r#"\\?\"#).unwrap_or(&buf).to_string()
    } else {
      buf
    };

    Some(final_buf)
  }
}

#[cfg(windows)]
fn is_safe_to_strip_prefix(path: &Path) -> bool {
  let mut components = path.components();
  match components.next() {
    Some(Component::Prefix(p)) => match p.kind() {
      Prefix::VerbatimDisk(..) => {},
      _ => return false, // Other kinds of UNC paths
    },
    _ => return false, // relative or empty
  }

  for component in components {
    match component {
      Component::RootDir | Component::Normal(_) => {},
      _ => return false, // UNC paths take things like ".." literally
    };
  }

  true
}

pub trait PathBufExt {
  fn normalize_slash(&self) -> Option<String>;
  fn from_slash<S: AsRef<str>>(s: S) -> Self;
  fn from_backslash<S: AsRef<str>>(s: S) -> Self;
}

impl PathBufExt for PathBuf {
  // Convert the file path into slash path as UTF-8 string.
  //
  // Any file path separators in the file path is replaced with '/'.
  // When the path contains non-Unicode sequence, this method returns None.
  //
  // On non-Windows OS, it is equivalent to `.to_str().map(std::to_string())`
  //
  fn normalize_slash(&self) -> Option<String> {
    self.as_path().normalize_slash()
  }

  // Convert the slash path (path separated with '/') to [`std::path::PathBuf`].
  //
  // Any '/' in the slash path is replaced with the file path separator.
  // The replacements only happen on Windows since the file path separators on other OSes are the
  // same as '/'.
  //
  // On non-Windows OS, it is simply equivalent to [`std::path::PathBuf::from`].
  //
  #[cfg(not(target_os = "windows"))]
  fn from_slash<S: AsRef<str>>(s: S) -> Self {
    PathBuf::from(s.as_ref())
  }

  #[cfg(target_os = "windows")]
  fn from_slash<S: AsRef<str>>(s: S) -> Self {
    let s = s
      .as_ref()
      .chars()
      .map(|c| match c {
        '/' => MAIN_SEPARATOR,
        c => c,
      })
      .collect::<String>();
    PathBuf::from(s)
  }

  // Convert the backslash path (path separated with '\') to [`std::path::PathBuf`].
  //
  // Any '\' in the slash path is replaced with the file path separator.
  // The replacements only happen on non-Windows.
  //
  #[cfg(not(target_os = "windows"))]
  fn from_backslash<S: AsRef<str>>(s: S) -> Self {
    let s = s
      .as_ref()
      .chars()
      .map(|c| match c {
        '\\' => MAIN_SEPARATOR,
        c => c,
      })
      .collect::<String>();
    PathBuf::from(s)
  }

  #[cfg(target_os = "windows")]
  fn from_backslash<S: AsRef<str>>(s: S) -> Self {
    PathBuf::from(s.as_ref())
  }
}
