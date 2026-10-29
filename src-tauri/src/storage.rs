use crate::atomic::write_atomic;
use chrono::offset::Local;
use dirs::data_local_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::str;
use std::sync::Mutex;

#[derive(Serialize, Debug, Default)]
pub struct StorageData {
  pub data: serde_json::Value,
  pub status: bool,
}

// Linux: $HOME/.local/share/mdsilo
// macOS: $HOME/Library/Application Support/mdsilo
// Windows: $HOME/AppData/Local/mdsilo
pub(crate) fn data_dir() -> Option<PathBuf> {
  data_local_dir().map(|dir| dir.join("mdsilo"))
}

#[tauri::command]
pub fn create_mdsilo_dir() -> Option<PathBuf> {
  let Some(data_path) = data_dir() else {
    log_error("Error on getting local_data_dir");
    return None;
  };
  // make sure the mdsilo dir is created
  match fs::create_dir_all(&data_path) {
    Ok(_) => Some(data_path),
    Err(e) => {
      log_error(format!("Error on creating local_data_dir: {:?}", e));
      None
    }
  }
}

/// Store the JSON value under `key` in `dir`: JSON in bincode, as ever.
/// It does not log: the log is stored with it.
fn set_data_in(dir: &Path, key: &str, value: &Value) -> Result<(), String> {
  let vec_value =
    serde_json::to_vec(value).map_err(|e| format!("Err on [set_data: serde_json::to_vec]: {e:?}"))?;
  let bin_value = bincode::serde::encode_to_vec(&vec_value, bincode::config::legacy())
    .map_err(|e| format!("Err on [set_data: bincode::serialize]: {e:?}"))?;
  // write_atomic creates the dir if needed
  write_atomic(&dir.join(key), &bin_value).map_err(|e| format!("Err on [set_data: write {key}]: {e:?}"))
}

fn get_data_in(dir: &Path, key: &str) -> StorageData {
  let Ok(bytes) = fs::read(dir.join(key)) else {
    return StorageData {
      status: false,
      data: Value::Null,
    };
  };
  let data: String = match bincode::serde::decode_from_slice(&bytes, bincode::config::legacy()) {
    Ok((data, _)) => data,
    // stored as plain JSON
    Err(_) => str::from_utf8(&bytes).unwrap_or("").to_string(),
  };
  match serde_json::from_str(&data) {
    Ok(data) => StorageData { data, status: true },
    Err(_) => StorageData {
      data: Value::Null,
      status: false,
    },
  }
}

#[tauri::command]
pub fn set_data(key: String, value: Value) -> bool {
  match data_dir() {
    Some(dir) => set_data_in(&dir, &key, &value)
      .map_err(log_error)
      .is_ok(),
    None => false,
  }
}

#[tauri::command]
pub fn get_data(key: String) -> Result<StorageData, String> {
  Ok(match data_dir() {
    Some(dir) => get_data_in(&dir, &key),
    None => StorageData::default(),
  })
}

#[tauri::command]
pub fn delete_data(key: String) -> bool {
  match data_dir() {
    Some(dir) => fs::remove_file(dir.join(key)).is_ok(),
    None => false,
  }
}

// log case
#[derive(Serialize, Deserialize, Debug, Default, Clone, PartialEq)]
pub struct LogItem {
  pub ty: String,
  pub info: String,
  pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct LogItems {
  pub logs: Vec<LogItem>,
}

const LOG_KEY: &str = "log";
/// the log keeps the latest ones only: it is read and written on each entry
pub const MAX_LOG_ITEMS: usize = 500;
/// one writer of the log at a time, the entries of another one would be lost
static LOG_LOCK: Mutex<()> = Mutex::new(());

fn get_log_in(dir: &Path) -> Vec<LogItem> {
  let data = get_data_in(dir, LOG_KEY).data;
  serde_json::from_value::<LogItems>(data).unwrap_or_default().logs
}

/// Add the items before the ones logged already, newest first.
fn add_log_in(dir: &Path, mut items: Vec<LogItem>) -> bool {
  let _guard = LOG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  items.extend(get_log_in(dir));
  items.truncate(MAX_LOG_ITEMS);
  // not logged if it fails: it would log again, and again
  serde_json::to_value(LogItems { logs: items })
    .is_ok_and(|value| set_data_in(dir, LOG_KEY, &value).is_ok())
}

#[tauri::command]
pub fn set_log(log_data: Vec<LogItem>) -> bool {
  match data_dir() {
    Some(dir) => add_log_in(&dir, log_data),
    None => false,
  }
}

#[tauri::command]
pub fn get_log() -> Vec<LogItem> {
  match data_dir() {
    Some(dir) => get_log_in(&dir),
    None => vec![],
  }
}

#[tauri::command]
pub fn del_log() -> bool {
  delete_data(LOG_KEY.to_string())
}

pub fn do_log(ty: String, info: String, timestamp: String) -> bool {
  set_log(vec![LogItem {
    ty,
    info,
    timestamp,
  }])
}

/// Log an error, timestamped now.
pub fn log_error(info: impl Into<String>) {
  do_log(
    "Error".to_string(),
    info.into(),
    Local::now().format("%m/%d/%Y %H:%M:%S").to_string(),
  );
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("mdsilo-storage-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    dir
  }

  fn item(info: &str) -> LogItem {
    LogItem {
      ty: "Error".to_string(),
      info: info.to_string(),
      timestamp: String::new(),
    }
  }

  #[test]
  fn stores_and_reads_back_json() {
    let dir = temp_dir("data");
    let value = serde_json::json!({ "a": [1, 2], "b": "text" });
    assert!(set_data_in(&dir, "key", &value).is_ok());
    let read = get_data_in(&dir, "key");
    assert!(read.status);
    assert_eq!(read.data, value);
    // missing key
    assert!(!get_data_in(&dir, "none").status);
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn reads_plain_json_too() {
    let dir = temp_dir("plain");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("key"), br#"{"x":1}"#).unwrap();
    assert_eq!(get_data_in(&dir, "key").data, serde_json::json!({ "x": 1 }));
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn the_log_keeps_the_latest_items_first() {
    let dir = temp_dir("log");
    assert!(add_log_in(&dir, vec![item("one")]));
    assert!(add_log_in(&dir, vec![item("two"), item("three")]));
    let infos: Vec<String> = get_log_in(&dir).into_iter().map(|i| i.info).collect();
    assert_eq!(infos, vec!["two", "three", "one"]);

    let many = (0..MAX_LOG_ITEMS).map(|i| item(&i.to_string())).collect();
    add_log_in(&dir, many);
    let log = get_log_in(&dir);
    // the oldest ones are dropped
    assert_eq!(log.len(), MAX_LOG_ITEMS);
    assert_eq!(log[0].info, "0");
    assert_eq!(log[MAX_LOG_ITEMS - 1].info, (MAX_LOG_ITEMS - 1).to_string());
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn concurrent_logs_are_all_kept() {
    let dir = temp_dir("concurrent");
    std::thread::scope(|s| {
      for t in 0..8 {
        let dir = &dir;
        s.spawn(move || {
          for i in 0..10 {
            add_log_in(dir, vec![item(&format!("{t}-{i}"))]);
          }
        });
      }
    });
    assert_eq!(get_log_in(&dir).len(), 80);
    fs::remove_dir_all(&dir).unwrap();
  }
}
