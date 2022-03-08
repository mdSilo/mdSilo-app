#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod files;
mod storage;
mod tests;

use tauri::Manager;

#[tauri::command]
async fn close_splashscreen(window: tauri::Window) {
  // Close splashscreen
  if let Some(splashscreen) = window.get_window("splashscreen") {
    splashscreen.close().unwrap_or(());
  }
  // Show main window
  window.get_window("main").unwrap().show().unwrap_or(());
}

fn main() {
  tauri::Builder::default()
  .invoke_handler(tauri::generate_handler![
    close_splashscreen,
    files::read_directory,
    files::is_dir,
    files::get_file_meta,
    files::file_exist,
    files::create_dir_recursive,
    files::create_file,
    files::read_file,
    files::write_file,
    files::copy_file,
    files::copy_file_to_assets,
    files::delete_files,
    files::list_directory,
    files::listen_dir,
    files::open_url,
    storage::set_data,
    storage::get_data,
    storage::delete_data,
  ])
  .run(tauri::generate_context!())
  .expect("error while running tauri application");
}
