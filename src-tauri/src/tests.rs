#[cfg(test)]
mod tests {
  use crate::files::*;
  use crate::paths::{PathBufExt, PathExt};
  use crate::storage::*;
  use std::path::{Path, PathBuf};

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
    assert_eq!(is_dir(Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap(), true);
    assert_eq!(
      is_dir(&Path::new(env!("CARGO_MANIFEST_DIR")).join("cargo.toml")).unwrap(),
      false
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
  async fn test_get_dirpath() {
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
    assert_eq!(
      file_exist(Path::new(env!("CARGO_MANIFEST_DIR")).to_str().unwrap()),
      true
    );
    assert_eq!(
      file_exist(
        Path::new(env!("CARGO_MANIFEST_DIR"))
          .join("Cargo.toml")
          .to_str()
          .unwrap()
      ),
      true
    );
    assert_eq!(
      file_exist(
        Path::new(env!("CARGO_MANIFEST_DIR"))
          .join("cargo.toml.bak")
          .to_str()
          .unwrap()
      ),
      false
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
  async fn test_file_operation() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/md/silo")
      .to_str()
      .unwrap()
      .to_string();
    // create dir
    create_dir_recursive(dir.clone()).await;
    assert_eq!(is_dir(Path::new(dir.as_str())).unwrap(), true);
    assert_eq!(file_exist(&dir), true);

    let file = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/md/silo/app.txt")
      .to_str()
      .unwrap()
      .to_string();
    // create file
    create_file(file.clone()).await;
    assert_eq!(file_exist(&file), true);
    assert_eq!(is_dir(Path::new(file.as_str())).unwrap(), false);

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
    assert_eq!(copied, true);
    assert_eq!(file_exist(&to_path), true);

    // copy file to assets
    let work_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/silo")
      .normalize_slash()
      .unwrap();
    let asset_path = copy_file_to_assets(to_path.clone(), work_dir.clone()).await;
    let abs_path = asset_path.0;
    let rel_path = asset_path.1;
    assert_eq!(is_dir(Path::new(work_dir.as_str())).unwrap(), true);
    assert_eq!(abs_path, format!("{}/assets/app.txt", work_dir.clone()));
    assert_eq!(file_exist(&abs_path), true);
    assert_eq!(rel_path, "./assets/app.txt");
    // override copy
    let asset_path_1 =
      copy_file_to_assets(to_path.clone(), format!("{}/", work_dir)).await;
    let abs_path_1 = asset_path_1.0;
    let rel_path_1 = asset_path_1.1;
    assert_eq!(abs_path_1, format!("{}/assets/app.txt", work_dir.clone()));
    assert_eq!(file_exist(&abs_path_1), true);
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
    assert_eq!(file_exist(&from_dir), true);
    // rename
    rename_file(from_dir.clone(), to_dir.clone()).await;
    assert_eq!(file_exist(&from_dir), false);
    assert_eq!(file_exist(&to_dir), true);

    // del files or dir
    let to_del_files = vec![file.clone(), to_path.clone(), to_dir.clone()];
    // files.push(file.clone());
    // del src file
    delete_files(to_del_files).await;
    assert_eq!(file_exist(&file), false);
    assert_eq!(file_exist(&to_path), false);
    assert_eq!(file_exist(&to_dir), false);

    #[cfg(not(target_os = "macos"))]
    assert_eq!(file_exist(&abs_path_1), true); // ci test failed on win, but OK on Win10
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
    assert_eq!(file_exist(&abs_path_1), false);
    assert_eq!(file_exist(&dir), false);

    let to_del_files_1 = vec![abs_path_1.clone()];
    // can exec del on non-existing on macOS
    delete_files(to_del_files_1).await;
    assert_eq!(file_exist(&abs_path_1), false);
    // now no file in it, dir deleted
    delete_files(to_del_dirs).await;
    assert_eq!(file_exist(&dir), false);
  }

  #[tokio::test]
  #[ignore = "on my computer only"]
  async fn test_copy_file_operation() {
    // copy file
    delete_files(vec![String::from("/home/uu/Documents/temple.jpg")]).await;
    let copied = copy_file(
      String::from("/home/uu/Pictures/temple.jpg"),
      String::from("/home/uu/Documents/temple.jpg"),
    )
    .await;
    assert_eq!(copied, true);
    assert_eq!(file_exist("/home/uu/Documents/temple.jpg"), true);

    // copy file to assets
    delete_files(vec![String::from("/home/uu/Documents/assets/temple.jpg")]).await;
    let asset_path = copy_file_to_assets(
      String::from("/home/uu/Pictures/temple.jpg"),
      String::from("/home/uu/Documents"),
    )
    .await;
    let to_path = asset_path.0;
    let relative_path = asset_path.1;
    assert_eq!(to_path, "/home/uu/Documents/assets/temple.jpg");
    assert_eq!(file_exist("/home/uu/Documents/assets/temple.jpg"), true);
    assert_eq!(relative_path, "./assets/temple.jpg");

    delete_files(vec![String::from("/home/uu/Documents/assets/beauty.jpg")]).await;
    let asset_path_1 = copy_file_to_assets(
      String::from("/home/uu/Pictures/beauty.jpg"),
      String::from("/home/uu/Documents/"),
    )
    .await;
    let to_path_1 = asset_path_1.0;
    let relative_path_1 = asset_path_1.1;
    assert_eq!(to_path_1, "/home/uu/Documents/assets/beauty.jpg");
    assert_eq!(file_exist("/home/uu/Documents/assets/beauty.jpg"), true);
    assert_eq!(relative_path_1, "./assets/beauty.jpg");
  }

  #[test]
  fn test_storage_operation() {
    let key = String::from("test_key");
    let value: serde_json::Value = serde_json::from_str(
      "{
            \"id\": \"0X520\",
            \"name\": \"mdsilo\"
        }",
    )
    .unwrap();

    // set
    set_data(key.clone(), value.clone());
    // get
    let store_data = get_data(key.clone()).unwrap();
    assert_eq!(value, store_data.data);
    assert_eq!(true, store_data.status);
    // del
    delete_data(key.clone());
    let store_data_0 = get_data(key).unwrap();
    assert_eq!(serde_json::Value::Null, store_data_0.data);
    assert_eq!(false, store_data_0.status);
  }
}
