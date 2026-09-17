use std::path::Path;
use tauri_plugin_dialog::DialogExt;

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
  
  // Check if the script path is provided and valid
  
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
          let err_msg = format!("[app.items.script] {}\n{}", script_path, msg);
          app.dialog()
            .message(err_msg)
            .title(&title)
            .show(|_| {});
          "".to_string()
        });
      inject_script += &format!("{script_content}\n");
    }
  }

  std::thread::spawn(move || {
      let _window = tauri::WebviewWindowBuilder::new(
      &app,
      label,
        tauri::WebviewUrl::App(url.parse().unwrap()),
    )
    .initialization_script(INIT_SCRIPT)
    .initialization_script(&inject_script)
    .title(title)
    .build()
    .unwrap();
  });
}

#[tauri::command]
pub fn msg_dialog(_app: tauri::AppHandle, title: &str, msg: &str) {
  _app
    .dialog()
    .message(msg)
    .title(title)
    .show(|_| {});
}
