use crate::storage::log_error;
use crate::wsfs::{LocalFs, WorkspaceFs};
use md5::{Digest, Md5};
use std::path::Path;

/// The offsets of the chunks hashed to identify a book: 0, then 1 KiB << 2i
/// for i in 0..=10 (1 KiB, 4 KiB, ... 1 GiB), as KOReader and readup do.
const CHUNK: u64 = 1024;

fn hex(bytes: &[u8]) -> String {
  bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn chunk_offsets() -> impl Iterator<Item = u64> {
  std::iter::once(0).chain((0..=10).map(|i| CHUNK << (2 * i)))
}

/// The partial MD5 of a file: of its chunks at the offsets above, quick even
/// for a big book, and the same for the same content wherever it is.
pub fn partial_md5(fs: &dyn WorkspaceFs, path: &Path) -> std::io::Result<String> {
  let size = fs
    .stat(path)
    .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no such file"))?
    .size;
  let mut hasher = Md5::new();
  for offset in chunk_offsets() {
    if offset >= size {
      break;
    }
    hasher.update(fs.read_range(path, offset, CHUNK)?);
  }
  Ok(hex(&hasher.finalize()))
}

/// The id of a book file, see partial_md5; empty if it cannot be read.
#[tauri::command]
pub async fn book_hash(file_path: String) -> String {
  partial_md5(&LocalFs, Path::new(&file_path)).unwrap_or_else(|e| {
    log_error(format!("Error on [book_hash, {file_path}]: {e:?}"));
    String::new()
  })
}

/// The bytes of a file, sent as binary, not as a JSON array of numbers.
#[tauri::command]
pub async fn read_file_bytes(file_path: String) -> Result<tauri::ipc::Response, String> {
  let bytes = tauri::async_runtime::spawn_blocking(move || LocalFs.read(Path::new(&file_path)))
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
  Ok(tauri::ipc::Response::new(bytes))
}

/// Write bytes to a file, e.g. the cover of a book cached.
#[tauri::command]
pub async fn write_file_bytes(file_path: String, data: Vec<u8>) -> bool {
  LocalFs.write_atomic(Path::new(&file_path), &data).is_ok()
}

/// Write the bytes of the request, sent as binary (a big book), to the file
/// of its `file-path` header, percent encoded: not as a JSON array of numbers.
#[tauri::command]
pub async fn write_file_raw(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
  let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
    return Err("expected the bytes of the file".into());
  };
  let path = request
    .headers()
    .get("file-path")
    .and_then(|v| v.to_str().ok())
    .ok_or("no file-path")?;
  let path = percent_encoding::percent_decode_str(path)
    .decode_utf8()
    .map_err(|e| e.to_string())?;
  Ok(LocalFs.write_atomic(Path::new(path.as_ref()), data).is_ok())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn hashes_the_chunks_of_a_file() {
    let dir = std::env::temp_dir().join(format!("mdsilo-books-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let small = dir.join("small.epub");
    fs::write(&small, b"hello").unwrap();
    // the whole of a small file
    assert_eq!(partial_md5(&LocalFs, &small).unwrap(), "5d41402abc4b2a76b9719d911017c592");

    // chunks at 0, 1 KiB and 4 KiB of a 5000 bytes file
    let data: Vec<u8> = (0..5000u32).map(|i| (i % 251) as u8).collect();
    let big = dir.join("big.pdf");
    fs::write(&big, &data).unwrap();
    let mut expected = Md5::new();
    expected.update(&data[0..1024]);
    expected.update(&data[1024..2048]);
    expected.update(&data[4096..5000]);
    assert_eq!(partial_md5(&LocalFs, &big).unwrap(), hex(&expected.finalize()));

    assert!(partial_md5(&LocalFs, &dir.join("missing")).is_err());
    fs::remove_dir_all(&dir).unwrap();
  }
}
