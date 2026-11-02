//! The font families installed on the system, for the font lists of the
//! editor and the reader: the font folders of the system (on Linux those of
//! the fontconfig settings) read by fontdb, in Rust, no C library. Listed
//! once, then kept; `refresh` lists them again.

use std::sync::Mutex;

static FAMILIES: Mutex<Option<Vec<String>>> = Mutex::new(None);

/// Sorted, without repeats, nor the families the system hides (`.SF NS` on macOS)
pub(crate) fn clean(families: Vec<String>) -> Vec<String> {
  let mut families: Vec<String> = families
    .into_iter()
    .map(|f| f.trim().to_string())
    .filter(|f| !f.is_empty() && !f.starts_with('.'))
    .collect();
  families.sort_by_key(|f| f.to_lowercase());
  families.dedup();
  families
}

/// The family of each font, by its English name when it has one (as CSS
/// matches it), else its first
fn list() -> Result<Vec<String>, String> {
  let mut db = fontdb::Database::new();
  db.load_system_fonts();
  let families = db
    .faces()
    .filter_map(|face| {
      face
        .families
        .iter()
        .find(|(_, lang)| *lang == fontdb::Language::English_UnitedStates)
        .or_else(|| face.families.first())
        .map(|(name, _)| name.clone())
    })
    .collect();
  Ok(clean(families))
}

#[tauri::command]
pub async fn system_fonts(refresh: Option<bool>) -> Result<Vec<String>, String> {
  if !refresh.unwrap_or(false)
    && let Some(families) = FAMILIES.lock().ok().and_then(|f| f.clone())
  {
    return Ok(families);
  }
  let families = tauri::async_runtime::spawn_blocking(list)
    .await
    .map_err(|e| e.to_string())??;
  if let Ok(mut kept) = FAMILIES.lock() {
    *kept = Some(families.clone());
  }
  Ok(families)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sorts_and_cleans_the_families() {
    let families = ["Noto Serif", "arial", ".SF NS", " Noto Serif ", "", "Zed"]
      .map(String::from)
      .to_vec();
    assert_eq!(clean(families), ["arial", "Noto Serif", "Zed"]);
  }

  #[test]
  fn lists_the_fonts_of_this_system() {
    // a machine with no fonts at all lists none, but does not fail
    let families = list().unwrap();
    assert_eq!(families, clean(families.clone()));
  }
}
