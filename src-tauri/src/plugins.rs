use tauri::{
  api::path::local_data_dir, 
  Runtime, generate_handler, 
  plugin::{Builder, TauriPlugin}, 
};

use std::path::Path;

pub const INIT_SCRIPT: &str = include_str!("./scripts/init.js");

pub fn inject_plugin<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("inject")
    .invoke_handler(generate_handler![])
    .js_init_script(inject_script(None))
    .build()
}

pub fn inject_script(script_path: Option<String>) -> String {
  // inject js script
  let mut script = format!("// ## Script Injection ## \n\n {INIT_SCRIPT}");
  // TODO: set the script dir or default dir is `local_data_dir/mdsilo/plugins`
  let script_path = script_path.unwrap_or_else(|| {
    if let Some(local_dir) = local_data_dir() {
      Path::new(&local_dir).join("mdsilo/plugins").display().to_string()
    } else {
      String::new()
    }
  });

  if !script_path.is_empty() {
    // check is dir or file and read all files
    let file_path = Path::new(&script_path);
    if file_path.is_dir() {
      if let Ok(paths) = std::fs::read_dir(file_path) {
        for path in paths {
          if let Ok(file_path_) = path {
            let file = file_path_.path().display().to_string();
            let script_content =
              std::fs::read_to_string(&file).unwrap_or_default();
            script += &format!("{script_content}\n");
          }
        }
      }
    } else if file_path.is_file() {
      let script_content =
        std::fs::read_to_string(&script_path).unwrap_or_default();
      script += &format!("{script_content}\n");
    }
  }

  script
}
