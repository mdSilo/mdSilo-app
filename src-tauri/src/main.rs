#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod files;

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
  ])
  .run(tauri::generate_context!())
  .expect("error while running tauri application");
}
