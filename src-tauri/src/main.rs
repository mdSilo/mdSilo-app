#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod db;
mod feed;
mod files;
mod json;
mod models;
mod paths;
mod schema;
mod storage;
mod tests;
mod tray;
mod tree;
mod window;
mod plugins;

extern crate diesel;
extern crate diesel_migrations;

use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use tauri::Manager;

#[tauri::command]
async fn close_splashscreen(window: tauri::Window) {
  // Close splashscreen
  if let Some(splashscreen) = window.get_window("splashscreen") {
    splashscreen.close().unwrap_or(());
  }
  // Show main window
  if let Some(mainwindow) = window.get_window("main") {
    mainwindow.show().unwrap_or(());
  }
}

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("./migrations");

fn main() {
  let mut connection = db::establish_connection();
  connection
    .run_pending_migrations(MIGRATIONS)
    .expect("Error on migrating");

  tauri::Builder::default()
    .plugin(plugins::inject_plugin())
    .invoke_handler(tauri::generate_handler![
      close_splashscreen,
      window::msg_dialog,
      window::web_window,
      feed::fetch_feed,
      feed::add_channel,
      feed::import_channels,
      feed::get_channels,
      feed::delete_channel,
      feed::add_articles_with_channel,
      feed::get_articles,
      feed::get_article_by_url,
      feed::update_article_read_status,
      feed::update_article_star_status,
      feed::get_unread_num,
      feed::update_all_read_status,
      files::read_directory,
      files::is_dir,
      files::is_file,
      files::get_basename,
      files::get_dirpath,
      files::get_parent_dir,
      files::join_paths,
      files::get_file_meta,
      files::file_exist,
      files::create_dir_recursive,
      files::create_file,
      files::read_file,
      files::write_file,
      files::download_file,
      files::rename_file,
      files::copy_file,
      files::copy_file_to_assets,
      files::delete_files,
      files::list_directory,
      files::listen_dir,
      files::open_url,
      files::open_link,
      files::detect_lang,
      files::watch_event,
      storage::create_mdsilo_dir,
      storage::set_data,
      storage::get_data,
      storage::delete_data,
      storage::set_log,
      storage::get_log,
      storage::del_log,
      json::write_json,
      // json::save_notes,
      // json::get_notes,
    ])
    .system_tray(tray::menu())
    .on_system_tray_event(tray::handler)
    .run(tauri::generate_context!())
    .expect("error while running");
}
