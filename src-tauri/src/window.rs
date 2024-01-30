use std::path::Path;
use tauri::{api::dialog, Manager};

use crate::files::read_directory;

pub const INIT_SCRIPT: &str = include_str!("./scripts/init.js");

#[tauri::command]
pub async fn web_window(
  app: tauri::AppHandle,
  label: String,
  title: String,
  url: String,
  script_path: Option<String>, // script path: can be file or dir
) {
  // inject js script
  let mut inject_script = format!("// ## [{title}] Script Injection ## \n\n");
  let script_path = script_path.unwrap_or_default();
  if !script_path.is_empty() {
    // check is dir or file and read all files
    let file_path = Path::new(&script_path);
    if file_path.is_dir() {
      let dir_data = read_directory(&script_path).await;
      if let Ok(data) = dir_data {
        let dir_files = data.files;
        for file in dir_files {
          let file_script = file.file_text;
          inject_script += &format!("{file_script}\n\n");
        }
      }
    } else if file_path.is_file() {
      let script_content =
        std::fs::read_to_string(&script_path).unwrap_or_else(|msg| {
          let main_window = app.get_window("main").unwrap();
          let err_msg = format!("[app.items.script] {}\n{}", script_path, msg);
          dialog::message(Some(&main_window), &title, err_msg);
          "".to_string()
        });
      inject_script += &format!("{script_content}\n");
    }
  }

  std::thread::spawn(move || {
    let _window = tauri::WindowBuilder::new(
      &app,
      label,
      tauri::WindowUrl::App(url.parse().unwrap()),
    )
    .initialization_script(INIT_SCRIPT)
    .initialization_script(&inject_script)
    .title(title)
    .build()
    .unwrap();
  });
}

#[tauri::command]
pub fn msg_dialog(app: tauri::AppHandle, title: &str, msg: &str) {
  let win = app.app_handle().get_window("main");
  tauri::api::dialog::message(win.as_ref(), title, msg);
}
