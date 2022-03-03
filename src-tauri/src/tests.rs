#[cfg(test)]
mod tests {
  use crate::files::*;
  use crate::storage::*;

  #[test]
  fn test_get_basename() {
    assert_eq!(get_basename("/home/user/file.txt"), "file.txt");
    assert_eq!(get_basename("/home/user/file.txt/"), "file.txt");
    assert_eq!(get_basename("C://a/b/c"), "c");
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

  #[tokio::test]
  async fn test_file_operation() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/a/b")
      .to_str()
      .unwrap()
      .to_string();
    // create dir
    create_dir_recursive(dir.clone()).await;
    assert_eq!(is_dir(std::path::Path::new(dir.as_str())).unwrap(), true);
    assert_eq!(file_exist(&dir), true);

    let file = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp/a/b/c.txt")
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

    // del files or dir
    let mut files = Vec::new();
    files.push(file.clone());
    delete_files(files).await;
    assert_eq!(file_exist(&file), false);

    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../temp")
      .to_str()
      .unwrap()
      .to_string();
    let mut dirs = Vec::new();
    dirs.push(dir.clone());
    delete_files(dirs.clone()).await;
    assert_eq!(file_exist(&dir), false);
  }

  #[test]
  fn test_storage_operation() {
    let key = String::from("test_key");
    let value: serde_json::Value = 
      serde_json::from_str(
        "{
            \"id\": \"0XABCD\",
            \"name\": \"Menlo Park, CA\"
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
