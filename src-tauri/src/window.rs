use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn msg_dialog(_app: tauri::AppHandle, title: &str, msg: &str) {
  _app.dialog().message(msg).title(title).show(|_| {});
}

/// Open the system print dialog for the webview, where the note can be saved
/// as a PDF of text. `window.print()` does nothing in the macOS webview.
#[tauri::command]
pub fn print_page(webview: tauri::Webview) -> Result<(), String> {
  webview.print().map_err(|e| e.to_string())
}
