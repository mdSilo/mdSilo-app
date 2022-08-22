// code modified from  https://github.com/rhysd/path-slash
// MIT License Copyright (c) 2018 rhysd

use std::path::{Path, PathBuf};

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
    use std::path;

    let mut buf = String::new();
    let mut has_trailing_slash = false;
    for c in self.components() {
      match c {
        path::Component::RootDir => { /* empty */ }
        path::Component::CurDir => buf.push('.'),
        path::Component::ParentDir => buf.push_str(".."),
        path::Component::Prefix(ref prefix) => {
          if let Some(s) = prefix.as_os_str().to_str() {
            buf.push_str(s);
            // C:\foo is [Prefix, RootDir, Normal]. Avoid C://
            continue;
          } else {
            return None;
          }
        }
        path::Component::Normal(ref s) => {
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

    Some(buf)
  }
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
    use std::path;

    let s = s
      .as_ref()
      .chars()
      .map(|c| match c {
        '/' => path::MAIN_SEPARATOR,
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
    use std::path;

    let s = s
      .as_ref()
      .chars()
      .map(|c| match c {
        '\\' => path::MAIN_SEPARATOR,
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
