#[cfg(test)]
// the tests of the app, beside the ones of each module
#[allow(clippy::module_inception)]
mod tests {
  use crate::files::*;
  use crate::paths::{PathBufExt, PathExt};
  use std::path::{Path, PathBuf};
  use std::sync::Mutex;

  // the tests using ../temp delete it at the end: one at a time
  static TEMP_DIR: Mutex<()> = Mutex::new(());

  #[test]
  fn test_get_basename() {
    assert_eq!(get_basename("/home/user/mdsilo.deb").0, "mdsilo.deb");
    assert_eq!(get_basename("/home/user/mdsilo.deb/").0, "mdsilo.deb");
    assert_eq!(get_basename("/home/user/mdsilo/").0, "mdsilo");
    assert_eq!(get_basename("/home/user/mdsilo").0, "mdsilo");
    assert_eq!(
      get_basename("C://Windows/AppData/mdsilo.msi").0,
      "mdsilo.msi"
    );
    #[cfg(target_os = "windows")]
    assert_eq!(get_basename(r"C:\\Files\mdsilo").0, "mdsilo");
    #[cfg(target_os = "windows")]
    assert_eq!(get_basename(r"C:\\Downloads\mdsilo.msi").0, "mdsilo.msi");
  }

  #[test]
  fn test_is_dir() {
    assert!(is_dir(Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap());
    assert!(
      !is_dir(&Path::new(env!("CARGO_MANIFEST_DIR")).join("cargo.toml")).unwrap()
    );
  }

  #[test]
  fn test_join_paths() {
    assert_eq!(join_paths("/home", vec![]), "/home");
    assert_eq!(join_paths("/home/", vec!["md/", "/silo/"]), "/home/md/silo");
    assert_eq!(
      join_paths("/home\\", vec!["\\md/", "/silo/\\"]),
      "/home/md/silo"
    );
    assert_eq!(
      join_paths("/home\\", vec!["\\md/", "/silo.app/\\"]),
      "/home/md/silo.app"
    );
    #[cfg(target_os = "windows")]
    assert_eq!(
      join_paths("C:\\home\\", vec!["\\md\\", "\\silo.app/\\"]),
      "C:/home/md/silo.app"
    );
  }

  #[tokio::test]
  #[allow(clippy::await_holding_lock)] // a runtime per test: no other task waits
  async fn test_get_dirpath() {
    let _temp = TEMP_DIR.lock().unwrap_or_else(|e| e.into_inner());
    let file = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/mdsilo/mdSilo_app.deb")
      .to_str()
      .unwrap()
      .to_string();
    // create file
    create_file(file.clone()).await;

    #[cfg(not(target_os = "windows"))]
    let dir_of_file = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/mdsilo")
      .to_str()
      .unwrap()
      .to_string();
    // test get dir name of a file path
    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_dirpath(&file), dir_of_file);
    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_parent_dir(&file), dir_of_file);
    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_dirpath(&format!("{}/", file)), dir_of_file);
    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_parent_dir(&format!("{}/", file)), dir_of_file);
    // on Window: left: `"D:/a/mdSilo-app/mdSilo-app/src-tauri/../temp/mdsilo"`,
    let window_dir_of_file = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/mdsilo")
      .normalize_slash()
      .unwrap();
    assert_eq!(get_dirpath(&file), window_dir_of_file);
    assert_eq!(get_dirpath(&file), get_dirpath(&format!("{}/", file)));
    assert_eq!(get_parent_dir(&file), window_dir_of_file);
    assert_eq!(get_parent_dir(&file), get_parent_dir(&format!("{}/", file)));

    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/mysilo")
      .to_str()
      .unwrap()
      .to_string();
    // create dir
    create_dir_recursive(dir.clone()).await;
    // test get dir name of a dir path
    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_dirpath(&dir), dir);
    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_dirpath(&format!("{}//", dir)), dir);

    let temp_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp")
      .to_str()
      .unwrap()
      .to_string();

    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_parent_dir(&dir), temp_dir);
    #[cfg(not(target_os = "windows"))]
    assert_eq!(get_parent_dir(&format!("{}//", dir)), temp_dir);
    // del temp folder for test
    let to_del_dirs = vec![file, dir, temp_dir];
    delete_files(to_del_dirs).await;
  }

  #[test]
  fn test_file_exist() {
    assert!(
      file_exist(Path::new(env!("CARGO_MANIFEST_DIR")).to_str().unwrap())
    );
    assert!(
      file_exist(
        Path::new(env!("CARGO_MANIFEST_DIR"))
          .join("Cargo.toml")
          .to_str()
          .unwrap()
      )
    );
    assert!(
      !file_exist(
        Path::new(env!("CARGO_MANIFEST_DIR"))
          .join("cargo.toml.bak")
          .to_str()
          .unwrap()
      )
    );
  }

  #[test]
  fn test_path_operation() {
    #[cfg(target_os = "windows")]
    let s1 = Path::new(r"md\silo\test.txt");
    #[cfg(not(target_os = "windows"))]
    let s1 = Path::new("md/silo/test.txt");
    assert_eq!(s1.normalize_slash(), Some("md/silo/test.txt".to_string()));

    #[cfg(target_os = "windows")]
    let s2 = PathBuf::from(r"md\silo\test.txt");
    #[cfg(not(target_os = "windows"))]
    let s2 = PathBuf::from("md/silo/test.txt");
    assert_eq!(s2.normalize_slash(), Some("md/silo/test.txt".to_string()));

    let p = PathBuf::from_slash("md/silo/test.txt");
    #[cfg(target_os = "windows")]
    assert_eq!(p, PathBuf::from(r"md\silo\test.txt"));
    #[cfg(not(target_os = "windows"))]
    assert_eq!(p, PathBuf::from("md/silo/test.txt"));

    #[cfg(target_os = "windows")]
    let path1 = PathBuf::from_slash("C:/md/silo");
    #[cfg(target_os = "windows")]
    assert_eq!(path1, PathBuf::from(r"C:\md\silo"));
    #[cfg(target_os = "windows")]
    let slash1 = path1.normalize_slash();
    #[cfg(target_os = "windows")]
    assert_eq!(slash1, Some("C:/md/silo".to_string()));

    #[cfg(target_os = "windows")]
    let path_prefix = PathBuf::from_slash(r"C:\");
    #[cfg(target_os = "windows")]
    let path_prefix_slash = path_prefix.normalize_slash();
    #[cfg(target_os = "windows")]
    assert_eq!(path_prefix_slash, Some("C:".to_string()));

    #[cfg(target_os = "windows")]
    let path_end_slash = PathBuf::from_slash(r"C:\md\silo\");
    #[cfg(target_os = "windows")]
    let path_without_endslash = path_end_slash.normalize_slash();
    #[cfg(target_os = "windows")]
    assert_eq!(path_without_endslash, Some("C:/md/silo".to_string()));

    #[cfg(target_os = "windows")]
    let path2 = PathBuf::from_slash(r"\\?\UNC\server\share/md/silo");
    #[cfg(target_os = "windows")]
    assert_eq!(path2, PathBuf::from(r"\\?\UNC\server\share\md\silo"));
    #[cfg(target_os = "windows")]
    let slash2 = path2.normalize_slash().unwrap();
    #[cfg(target_os = "windows")]
    assert_eq!(slash2, r"\\?\UNC\server\share/md/silo".to_string());
  }

  #[tokio::test]
  #[allow(clippy::await_holding_lock)] // a runtime per test: no other task waits
  async fn test_file_operation() {
    let _temp = TEMP_DIR.lock().unwrap_or_else(|e| e.into_inner());
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/md/silo")
      .to_str()
      .unwrap()
      .to_string();
    // create dir
    create_dir_recursive(dir.clone()).await;
    assert!(is_dir(Path::new(dir.as_str())).unwrap());
    assert!(file_exist(&dir));

    let file = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/md/silo/app.txt")
      .to_str()
      .unwrap()
      .to_string();
    // create file
    create_file(file.clone()).await;
    assert!(file_exist(&file));
    assert!(!is_dir(Path::new(file.as_str())).unwrap());

    // write and read file
    let to_write_text = String::from("Test Hello World");
    write_file(file.clone(), to_write_text.clone()).await;
    let read_file_text = read_file(file.clone()).await;
    assert_eq!(&to_write_text, &read_file_text);

    // copy file
    let to_path = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/mdsilo/app.txt")
      .to_str()
      .unwrap()
      .to_string();
    let copied = copy_file(file.clone(), to_path.clone()).await;
    assert!(copied);
    assert!(file_exist(&to_path));

    // copy file to assets
    let work_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/silo")
      .normalize_slash()
      .unwrap();
    let asset_path = copy_file_to_assets(to_path.clone(), work_dir.clone()).await;
    let abs_path = asset_path.0;
    let rel_path = asset_path.1;
    assert!(is_dir(Path::new(work_dir.as_str())).unwrap());
    assert_eq!(abs_path, format!("{}/assets/app.txt", work_dir.clone()));
    assert!(file_exist(&abs_path));
    assert_eq!(rel_path, "./assets/app.txt");
    // override copy
    let asset_path_1 =
      copy_file_to_assets(to_path.clone(), format!("{}/", work_dir)).await;
    let abs_path_1 = asset_path_1.0;
    let rel_path_1 = asset_path_1.1;
    assert_eq!(abs_path_1, format!("{}/assets/app.txt", work_dir.clone()));
    assert!(file_exist(&abs_path_1));
    assert_eq!(rel_path_1, "./assets/app.txt");

    // rename file
    let from_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/frommdsilo")
      .to_str()
      .unwrap()
      .to_string();
    let to_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/tomdsilo")
      .to_str()
      .unwrap()
      .to_string();
    create_dir_recursive(from_dir.clone()).await;
    assert!(file_exist(&from_dir));
    // rename
    rename_file(from_dir.clone(), to_dir.clone()).await;
    assert!(!file_exist(&from_dir));
    assert!(file_exist(&to_dir));

    // del files or dir
    let to_del_files = vec![file.clone(), to_path.clone(), to_dir.clone()];
    // files.push(file.clone());
    // del src file
    delete_files(to_del_files).await;
    assert!(!file_exist(&file));
    assert!(!file_exist(&to_path));
    assert!(!file_exist(&to_dir));

    #[cfg(not(target_os = "macos"))]
    assert!(file_exist(&abs_path_1)); // ci test failed on win, but OK on Win10
                                               // on macOS:
    #[cfg(target_os = "macos")]
    assert_eq!(file_exist(&abs_path_1), false);

    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp")
      .to_str()
      .unwrap()
      .to_string();
    let to_del_dirs = vec![dir.clone()];
    delete_files(to_del_dirs.clone()).await;
    assert!(!file_exist(&abs_path_1));
    assert!(!file_exist(&dir));

    let to_del_files_1 = vec![abs_path_1.clone()];
    // can exec del on non-existing on macOS
    delete_files(to_del_files_1).await;
    assert!(!file_exist(&abs_path_1));
    // now no file in it, dir deleted
    delete_files(to_del_dirs).await;
    assert!(!file_exist(&dir));
  }

  #[tokio::test]
  async fn test_list_directory() {
    // own dir: other tests remove ../temp while running in parallel
    let dir = std::env::temp_dir().join("mdsilo_test_list_directory");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("sub/inner")).unwrap();
    std::fs::write(dir.join("a.md"), "# a").unwrap();
    std::fs::write(dir.join("b.png"), "").unwrap();
    std::fs::write(dir.join(".hidden.md"), "").unwrap();
    std::fs::write(dir.join("sub/c.md"), "# c").unwrap();

    let mut names: Vec<(String, bool)> = list_directory(dir.to_str().unwrap())
      .await
      .unwrap()
      .into_iter()
      .map(|f| (f.file_name, f.is_dir))
      .collect();
    names.sort();
    // direct children only, hidden skipped, no content
    assert_eq!(
      names,
      vec![
        ("a.md".to_string(), false),
        ("b.png".to_string(), false),
        ("sub".to_string(), true),
      ]
    );
    let listed = list_directory(dir.to_str().unwrap()).await.unwrap();
    assert!(listed.iter().all(|f| f.file_text.is_empty() && !f.is_hidden));
    assert!(listed.iter().all(|f| f.file_path.ends_with(&format!("/{}", f.file_name))));

    // missing dir lists nothing
    assert!(list_directory(dir.join("nope").to_str().unwrap()).await.unwrap().is_empty());

    std::fs::remove_dir_all(&dir).unwrap();
  }
}
