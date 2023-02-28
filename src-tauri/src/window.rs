use tauri::command;

#[command]
pub async fn web_window(
  app: tauri::AppHandle,
  label: String,
  title: String,
  url: String,
  // script: Option<String>,
) {
  // TODO: inject js script
  std::thread::spawn(move || {
    let _window = tauri::WindowBuilder::new(
      &app,
      label,
      tauri::WindowUrl::App(url.parse().unwrap()),
    )
    //.initialization_script(&script)
    .title(title)
    .build()
    .unwrap();
  });
}
