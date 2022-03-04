use std::fs;
use std::str;
use std::path::Path;
use serde_json::Value;
use tauri::api::path::local_data_dir;

#[derive(serde::Serialize, Debug, Default)]
pub struct StorageData {
  pub data: serde_json::Value,
  pub status: bool,
}

#[tauri::command]
pub fn set_data(key: String, value: Value) -> bool {
  // println!("local data dir: {:?}", local_data_dir());

  // Linux: /home/~username~/.local/share/mdsilo
  let storage_dir = match local_data_dir() {
    Some(dir) => Path::new(&dir).join("mdsilo"),
    None => { return false; }
  };

  if fs::create_dir_all(storage_dir.clone()).is_err() {
   return false;
  };

  let ser_value = match serde_json::to_vec(&value) {
    Ok(val) => val,
    Err(_) => { return false; }
  };
  let bin_value = match bincode::serialize(&ser_value) {
    Ok(val) => val,
    Err(_) => { return false; }
  };
  
  fs::write(storage_dir.join(key), bin_value).is_ok()
}

#[tauri::command]
pub fn get_data(key: String) -> Result<StorageData, String> {
  let storage_dir = match local_data_dir() {
    Some(dir) => Path::new(&dir).join("mdsilo"),
    None => { return Ok(StorageData::default()); }
  };

  let mut status = true;
  let data: String;
  match fs::read(storage_dir.join(key)) {
    Ok(result) => match bincode::deserialize(&result) {
      Ok(deser_bincode) => data = deser_bincode,
      Err(_) => data = str::from_utf8(&result).unwrap_or("").to_string(),
    },
    Err(_e) => return Ok(StorageData {
      status: false,
      data: Value::Null,
    })
  }
  
  let data = match serde_json::from_str(&data) {
    Ok(result) => result,
    Err(_) => {
      status = false;
      Value::Null
    }
  };
  Ok(StorageData { data, status })
}

#[tauri::command]
pub fn delete_data(key: String) -> bool {
  let storage_dir = match local_data_dir() {
    Some(dir) => Path::new(&dir).join("mdsilo"),
    None => { return false; }
  };

  fs::remove_file(storage_dir.join(key)).is_ok()
}
