use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
  App, Manager, Runtime,
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{TrayIconBuilder, TrayIconEvent},
};

pub const MAIN_WIN: &str = "main";

/// Quit asked once: closing the main window, which may sync first (see
/// src/sync/autoSync.ts); asked again, quit at once.
static QUITTING: AtomicBool = AtomicBool::new(false);

pub fn setup<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
  let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
  let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
  let separator = PredefinedMenuItem::separator(app)?;
  let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit])?;

  let mut builder = TrayIconBuilder::new().tooltip("mdSilo").menu(&menu);
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }

  builder
    .on_menu_event(|app, event| {
      let Some(window) = app.get_webview_window(MAIN_WIN) else {
        return;
      };

      match event.id.as_ref() {
        "show" => {
          let _ = window.set_focus();
          let _ = window.show();
        }
        "hide" => {
          let _ = window.hide();
        }
        // the first quit closes the window (the guard does): the app quits
        // once it is gone, see lib.rs; the next quit, or no window to close,
        // quits at once
        "quit"
          if QUITTING.swap(true, Ordering::SeqCst) || window.close().is_err() =>
        {
          app.exit(0)
        }
        _ => {}
      }
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click { button, .. } = event
        && button == tauri::tray::MouseButton::Left
        && let Some(window) = tray.app_handle().get_webview_window(MAIN_WIN)
      {
        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
      }
    })
    .build(app)?;

  Ok(())
}
