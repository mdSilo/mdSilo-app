#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod ai;
mod atomic;
mod book_images;
mod books;
mod custom_plugins;
mod db;
mod ebook;
mod feed;
mod files;
mod index;
#[cfg(target_os = "linux")]
mod input_method;
mod models;
mod paths;
mod plugin_scheme;
mod publish;
mod schema;
mod storage;
mod sync;
mod system_fonts;
mod tests;
mod tray;
mod tts;
mod updater;
mod window;
mod wsfs;

extern crate diesel;
extern crate diesel_migrations;

use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use tauri::{Listener, Manager};

#[tauri::command]
async fn close_splashscreen(window: tauri::Window) {
  if let Some(splashscreen) = window.get_webview_window("splashscreen") {
    splashscreen.close().unwrap_or(());
  }
  if let Some(mainwindow) = window.get_webview_window("main") {
    mainwindow.show().unwrap_or(());
  }
}

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("./migrations");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // before GTK init
  #[cfg(target_os = "linux")]
  input_method::use_system_im_modules();

  let mut connection = db::establish_connection();
  connection
    .run_pending_migrations(MIGRATIONS)
    .expect("Error on migrating");

  let builder = tauri::Builder::default();
  // the self updater, see updater.rs
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
  builder
    .plugin(tauri_plugin_dialog::init())
    .manage(updater::PendingUpdate::default())
    .register_uri_scheme_protocol(plugin_scheme::SCHEME, |_ctx, request| {
      plugin_scheme::handle(&request)
    })
    .invoke_handler(tauri::generate_handler![
      updater::update_check,
      updater::update_install,
      close_splashscreen,
      window::msg_dialog,
      window::print_page,
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
      feed::add_starred_articles,
      feed::fetch_url,
      feed::fetch_image,
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
      custom_plugins::list_plugins,
      custom_plugins::install_plugin,
      custom_plugins::remove_plugin,
      custom_plugins::unpack_plugin,
      custom_plugins::forget_unpacked,
      custom_plugins::watch_plugin_dev,
      custom_plugins::unwatch_plugin_dev,
      plugin_scheme::set_plugin_net,
      system_fonts::system_fonts,
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
      books::book_hash,
      books::read_file_bytes,
      books::read_file_range,
      books::open_book_file,
      books::read_book_file,
      books::close_book_file,
      books::shrink_book_images,
      books::write_file_bytes,
      books::write_file_raw,
      ebook::book_info,
      ebook::book_index_text,
      index::index_open,
      index::index_renames,
      index::index_update,
      index::index_search,
      index::index_book,
      index::index_book_indexed,
      sync::sync_info,
      sync::sync_setup,
      sync::sync_run,
      publish::publish_write,
      publish::publish_push,
      publish::read_front_matters,
      tts::tts_engines,
      tts::tts_voices,
      tts::tts_speak,
      tts::tts_audio,
      tts::tts_stop,
      tts::tts_configure,
      tts::tts_clear_cache,
      ai::ai_providers,
      ai::ai_save_provider,
      ai::ai_delete_provider,
      ai::ai_fetch,
      ai::ai_stream,
      ai::ai_cancel,
    ])
    // the main window gone, the app quits, other windows too
    .on_window_event(|window, event| {
      if window.label() == tray::MAIN_WIN
        && matches!(event, tauri::WindowEvent::Destroyed)
      {
        window.app_handle().exit(0);
      }
    })
    .setup(|app| {
      tray::setup(app)?;
      // frontend: src/workspace/directory.ts/DirectoryAPI/unlisten
      app.listen_any("unlisten_dir", |_| files::unlisten_dir());
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running");
}
