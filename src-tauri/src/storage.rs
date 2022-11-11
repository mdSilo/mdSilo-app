use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::str;
use chrono::offset::Local;
use tauri::api::path::local_data_dir;

#[derive(Serialize, Debug, Default)]
pub struct StorageData {
  pub data: serde_json::Value,
  pub status: bool,
}

#[tauri::command]
pub fn set_data(key: String, value: Value) -> bool {
  // println!("local data dir: {:?}", local_data_dir());

  // Linux: $HOME/.local/share/mdsilo
  // macOS: $HOME/Library/Application
  // Windows: $HOME/AppData/Local/mdsilo
  let storage_dir = match local_data_dir() {
    Some(dir) => Path::new(&dir).join("mdsilo"),
    None => {
      return false;
    }
  };

  if fs::create_dir_all(storage_dir.clone()).is_err() {
    return false;
  };

  let vec_value = match serde_json::to_vec(&value) {
    Ok(val) => val,
    Err(e) => {
      do_log(
        "Error".to_string(), 
        format!("Err on [set_data: serde_json::to_ve]: {:?}", e), 
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S"))
      );
      return false;
    },
  };
  let bin_value = match bincode::serialize(&vec_value) {
    Ok(val) => val,
    Err(e) => {
      do_log(
        "Error".to_string(), 
        format!("Err on [set_data: bincode::serialize]: {:?}", e), 
        format!("{}", Local::now().format("%m/%d/%Y %H:%M:%S"))
      );
      return false;
    },
  };

  fs::write(storage_dir.join(key), bin_value).is_ok()
}

#[tauri::command]
pub fn get_data(key: String) -> Result<StorageData, String> {
  let storage_dir = match local_data_dir() {
    Some(dir) => Path::new(&dir).join("mdsilo"),
    None => {
      return Ok(StorageData::default());
    }
  };

  let mut status = true;
  let data: String;
  match fs::read(storage_dir.join(key)) {
    Ok(result) => match bincode::deserialize(&result) {
      Ok(deser_bincode) => data = deser_bincode,
      Err(_e) => data = str::from_utf8(&result).unwrap_or("").to_string(),
    },
    Err(_e) => {
      return Ok(StorageData {
        status: false,
        data: Value::Null,
      });
    },
  }

  let value = match serde_json::from_str(&data) {
    Ok(result) => result,
    Err(_e) => {
      {
        status = false;
        Value::Null
      }
    },
  };
  Ok(StorageData { data: value, status })
}

#[tauri::command]
pub fn delete_data(key: String) -> bool {
  let storage_dir = match local_data_dir() {
    Some(dir) => Path::new(&dir).join("mdsilo"),
    None => {
      return false;
    }
  };

  fs::remove_file(storage_dir.join(key)).is_ok()
}


// log case
#[derive(Serialize, Deserialize, Debug, Default)]
pub struct LogItem {
  pub ty: String,
  pub info: String,
  pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct LogItems {
  pub logs: Vec<LogItem>,
}
//
#[tauri::command]
pub fn set_log(log_data: Vec<LogItem>) -> bool {
  let mut old_log = get_log();
  let mut new_log = log_data;
  new_log.append(&mut old_log);
  let logs = LogItems { logs: new_log };
  let log_value = serde_json::to_value(logs);
  match log_value {
    Ok(value) => set_data("log".to_string(), value),
    Err(_) => false
  }
}

#[tauri::command]
pub fn get_log() -> Vec<LogItem> {
  let log_data = get_data("log".to_string());
  if let Ok(data) = log_data {
    let log_value = data.data;
    let log: LogItems = serde_json::from_value(log_value).unwrap_or_default();

    return log.logs;
  } else {
    return vec![];
  }
}

#[tauri::command]
pub fn del_log() -> bool {
  delete_data("log".to_string())
}

pub fn do_log(ty: String, info: String, timestamp: String) -> bool {
  let log_item = LogItem { ty, info, timestamp};
  set_log(vec![log_item])
}
