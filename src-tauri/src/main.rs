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
    files::get_file_meta_data,
    files::file_exist,
    files::create_file,
    files::create_dir_recursive,
    files::delete_file,
    files::get_files_in_directory,
    files::listen_dir,
    files::get_dir_size,
    files::get_file_properties,
    files::calculate_files_total_size,
    files::search_in_dir,
  ])
  .run(tauri::generate_context!())
  .expect("error while running tauri application");
}
