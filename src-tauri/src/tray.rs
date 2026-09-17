use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{TrayIconBuilder, TrayIconEvent},
  App, Manager, Runtime,
};

const MAIN_WIN: &str = "main";

pub fn setup<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
  let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
  let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
  let separator = PredefinedMenuItem::separator(app)?;
  let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit])?;

  TrayIconBuilder::new()
    .menu(&menu)
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
        "quit" => app.exit(0),
        _ => {}
      }
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click { button, .. } = event {
        if button == tauri::tray::MouseButton::Left {
          if let Some(window) = tray.app_handle().get_webview_window(MAIN_WIN) {
            let _ = window.set_focus();
            let _ = window.unminimize();
            let _ = window.show();
          }
        }
      }
    })
    .build(app)?;

  Ok(())
}
