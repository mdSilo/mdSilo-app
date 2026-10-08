//! Input methods (fcitx, ibus...) in the AppImage on Linux
//!
//! The AppImage bundles GTK with its own cache of the GTK input method
//! modules, set by `GTK_IM_MODULE_FILE`, which has none of the modules
//! installed on the system, e.g. fcitx: the input method could not be used.
//! https://github.com/mdSilo/mdSilo-app/issues/782

use std::path::{Path, PathBuf};

/// Use the input method modules cache of the system when the bundled one
/// lacks the input method asked by `GTK_IM_MODULE`. Call it before GTK init.
pub fn use_system_im_modules() {
  use std::env;

  // only in an AppImage
  if env::var_os("APPIMAGE").is_none() {
    return;
  }
  let Some(im) = env::var("GTK_IM_MODULE").ok().filter(|im| !im.is_empty()) else {
    return;
  };
  let bundled = env::var_os("GTK_IM_MODULE_FILE").map(PathBuf::from);
  if bundled
    .as_deref()
    .is_some_and(|cache| cache_has_module(cache, &im))
  {
    return;
  }
  if let Some(cache) = find_im_module_cache(&im, &system_caches()) {
    // SAFETY: called at start up, before any other thread is spawned
    unsafe { env::set_var("GTK_IM_MODULE_FILE", cache) };
  }
}

/// The GTK 3 input method modules caches the distros install
fn system_caches() -> Vec<PathBuf> {
  const CACHE: &str = "gtk-3.0/3.0.0/immodules.cache";
  let mut caches = vec![];
  // Debian, Ubuntu: multiarch dirs, e.g. /usr/lib/x86_64-linux-gnu
  if let Ok(entries) = std::fs::read_dir("/usr/lib") {
    for entry in entries.flatten() {
      let name = entry.file_name();
      if name.to_string_lossy().ends_with("-linux-gnu") {
        caches.push(entry.path().join(CACHE));
      }
    }
  }
  // Fedora, openSUSE; Arch
  caches.push(Path::new("/usr/lib64").join(CACHE));
  caches.push(Path::new("/usr/lib").join(CACHE));
  caches
}

/// The first cache which has the input method module `im`
pub fn find_im_module_cache(im: &str, caches: &[PathBuf]) -> Option<PathBuf> {
  caches
    .iter()
    .find(|cache| cache_has_module(cache, im))
    .cloned()
}

/// Check if the cache lists the module `im`: a line like
/// `"fcitx" "Fcitx5 (Flexible Input Method Framework5)" "fcitx5" ...`
fn cache_has_module(cache: &Path, im: &str) -> bool {
  let Ok(text) = std::fs::read_to_string(cache) else {
    return false;
  };
  let id = format!("\"{im}\"");
  text.lines().any(|line| line.trim_start().starts_with(&id))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_find_im_module_cache() {
    let dir = std::env::temp_dir().join(format!("mdsilo-im-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let bundled = dir.join("bundled.cache");
    std::fs::write(
      &bundled,
      "\"/app/usr/lib/im-wayland.so\"\n\"wayland\" \"Wayland\" \"gtk30\" \"\" \"\"\n",
    )
    .unwrap();
    let system = dir.join("system.cache");
    std::fs::write(
      &system,
      "# Created by gtk-query-immodules-3.0\n\
       \"/usr/lib/x86_64-linux-gnu/gtk-3.0/3.0.0/immodules/im-fcitx5.so\"\n\
       \"fcitx\" \"Fcitx5 (Flexible Input Method Framework5)\" \"fcitx5\" \"/usr/locale\" \"ja:ko:zh:*\"\n\
       \"ibus\" \"IBus\" \"ibus\" \"\" \"ja:ko:zh:*\"\n",
    )
    .unwrap();
    let missing = dir.join("missing.cache");
    let caches = [missing, bundled.clone(), system.clone()];

    assert_eq!(find_im_module_cache("fcitx", &caches), Some(system.clone()));
    assert_eq!(find_im_module_cache("ibus", &caches), Some(system));
    assert_eq!(find_im_module_cache("wayland", &caches), Some(bundled));
    // the path of a module is not a module
    assert_eq!(find_im_module_cache("fcitx5", &caches), None);
    assert_eq!(find_im_module_cache("xim", &caches), None);

    std::fs::remove_dir_all(&dir).unwrap();
  }
}
