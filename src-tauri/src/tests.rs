#[cfg(test)]
mod tests {
  use std::path::{Path, PathBuf};
  use crate::paths::{PathExt, PathBufExt};
  use crate::files::*;
  use crate::storage::*;

  #[test]
  fn test_get_basename() {
    assert_eq!(get_basename("/home/user/mdsilo.deb").0, "mdsilo.deb");
    assert_eq!(get_basename("/home/user/mdsilo.deb/").0, "mdsilo.deb");
    assert_eq!(get_basename("/home/user/mdsilo/").0, "mdsilo");
    assert_eq!(get_basename("/home/user/mdsilo").0, "mdsilo");
    assert_eq!(get_basename("C://Windows/AppData/mdsilo.msi").0, "mdsilo.msi");
    // assert_eq!(get_basename(r"C:\\Files\mdsilo").0, "mdsilo");
    // assert_eq!(get_basename(r"C:\\Downloads\mdsilo.msi").0, "mdsilo.msi");
  }

  #[test]
  fn test_is_dir() {
    assert_eq!(
      is_dir(std::path::Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap(),
      true
    );
    assert_eq!(
      is_dir(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("cargo.toml")).unwrap(),
      false
    );
  }

  #[test]
  fn test_file_exist() {
    assert_eq!(
      file_exist(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
          .to_str()
          .unwrap()
      ),
      true
    );
    assert_eq!(
      file_exist(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
          .join("Cargo.toml")
          .to_str()
          .unwrap()
      ),
      true
    );
    assert_eq!(
      file_exist(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
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
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/md/silo")
      .to_str()
      .unwrap()
      .to_string();
    // create dir
    create_dir_recursive(dir.clone()).await;
    assert_eq!(is_dir(std::path::Path::new(dir.as_str())).unwrap(), true);
    assert_eq!(file_exist(&dir), true);

    let file = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/md/silo/app.txt")
      .to_str()
      .unwrap()
      .to_string();
    // create file
    create_file(file.clone()).await;
    assert_eq!(file_exist(&file), true);
    assert_eq!(is_dir(std::path::Path::new(file.as_str())).unwrap(), false);

    // write and read file
    let to_write_text = String::from("Test Hello World");
    write_file(file.clone(), to_write_text.clone()).await;
    let read_file_text = read_file(file.clone()).await;
    assert_eq!(&to_write_text, &read_file_text);

    // copy file
    let to_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/mdsilo/app.txt")
      .to_str()
      .unwrap()
      .to_string();
    let copied = copy_file(file.clone(), to_path.clone()).await;
    assert_eq!(copied, true);
    assert_eq!(file_exist(&to_path), true);
    
    // copy file to assets
    let work_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/silo")
      .normalize_slash()
      .unwrap();
    let asset_path = copy_file_to_assets(to_path.clone(), work_dir.clone()).await;
    assert_eq!(is_dir(std::path::Path::new(work_dir.as_str())).unwrap(), true);
    assert_eq!(asset_path, format!("{}/assets/app.txt", work_dir.clone()));
    assert_eq!(file_exist(&asset_path), true);
    
    let asset_path_1 = copy_file_to_assets(to_path.clone(), format!("{}/", work_dir)).await;
    assert_eq!(asset_path_1, format!("{}/assets/app.txt", work_dir.clone()));
    assert_eq!(file_exist(&asset_path_1), true);

    // del files or dir
    let to_del_files = vec![file.clone(), to_path];
    // files.push(file.clone());
    delete_files(to_del_files).await;
    assert_eq!(file_exist(&file), false);

    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp")
      .to_str()
      .unwrap()
      .to_string();
    let to_del_dirs = vec![dir.clone()];
    assert_eq!(file_exist(&asset_path_1), true);
    delete_files(to_del_dirs.clone()).await;
    // not del the dir, for a file in it
    // but on macOS:
    // left: `false`,  right: `true`' , thus dir deleted on macOS
    #[cfg(target_os = "linux")]
    assert_eq!(file_exist(&asset_path_1), true);
    #[cfg(target_os = "linux")]
    assert_eq!(file_exist(&dir), true);

    let to_del_files_1 = vec![asset_path_1.clone()];
    // if can exec on non-existing? on macOS
    delete_files(to_del_files_1).await;
    assert_eq!(file_exist(&asset_path_1), false);
    // now no file in it, dir deleted
    delete_files(to_del_dirs.clone()).await;
    assert_eq!(file_exist(&dir), false);
  }

  #[tokio::test]
  #[ignore="on my computer only"]
  async fn test_copy_file_operation() {
    // copy file
    delete_files(vec![String::from("/home/uu/Documents/temple.jpg")]).await;
    let copied = copy_file(
      String::from("/home/uu/Pictures/temple.jpg"), 
      String::from("/home/uu/Documents/temple.jpg")
    )
    .await;
    assert_eq!(copied, true);
    assert_eq!(file_exist("/home/uu/Documents/temple.jpg"), true);
    
    // copy file to assets
    delete_files(vec![String::from("/home/uu/Documents/assets/temple.jpg")]).await;
    let to_path = copy_file_to_assets(
      String::from("/home/uu/Pictures/temple.jpg"), 
      String::from("/home/uu/Documents")
    )
    .await;
    assert_eq!(to_path, "/home/uu/Documents/assets/temple.jpg");
    assert_eq!(file_exist("/home/uu/Documents/assets/temple.jpg"), true);

    delete_files(vec![String::from("/home/uu/Documents/assets/beauty.jpg")]).await;
    let to_path_1 = copy_file_to_assets(
      String::from("/home/uu/Pictures/beauty.jpg"), 
      String::from("/home/uu/Documents/")
    )
    .await;
    assert_eq!(to_path_1, "/home/uu/Documents/assets/beauty.jpg");
    assert_eq!(file_exist("/home/uu/Documents/assets/beauty.jpg"), true);
  }

  #[test]
  fn test_storage_operation() {
    let key = String::from("test_key");
    let value: serde_json::Value = 
      serde_json::from_str(
        "{
            \"id\": \"0X520\",
            \"name\": \"mdsilo\"
        }"
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
