#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod files;
mod paths;
mod storage;
mod tests;
mod json;
mod feed;
mod db;
mod models;
mod schema;
// mod pdf;

#[macro_use]
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
    .expect("Error migrating");

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      close_splashscreen,
      feed::fetch_feed,
      feed::add_channel,
      feed::import_channels,
      feed::get_channels,
      feed::delete_channel,
      feed::add_articles_with_channel,
      feed::get_articles,
      feed::update_article_read_status,
      feed::get_unread_num,
      feed::mark_all_read,
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
      files::rename_file,
      files::copy_file,
      files::copy_file_to_assets,
      files::delete_files,
      files::list_directory,
      files::listen_dir,
      files::open_url,
      storage::set_data,
      storage::get_data,
      storage::delete_data,
      json::write_json,
      // pdf::write_to_pdf, 
    ])
    .run(tauri::generate_context!())
    .expect("error while running");
}
