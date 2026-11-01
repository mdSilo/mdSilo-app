use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn msg_dialog(_app: tauri::AppHandle, title: &str, msg: &str) {
  _app.dialog().message(msg).title(title).show(|_| {});
}
