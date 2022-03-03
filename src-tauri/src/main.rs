#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod files;
mod storage;
mod tests;

fn main() {
  tauri::Builder::default()
  .invoke_handler(tauri::generate_handler![
    files::read_directory,
    files::is_dir,
    files::get_file_meta,
    files::file_exist,
    files::create_dir_recursive,
    files::create_file,
    files::read_file,
    files::write_file,
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
