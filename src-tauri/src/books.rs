use crate::storage::log_error;
use crate::wsfs::{LocalFs, WorkspaceFs};
use md5::{Digest, Md5};
use serde::Serialize;
use std::collections::VecDeque;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::{Arc, LazyLock, Mutex};

/// The offsets of the chunks hashed to identify a book: 0, then 1 KiB << 2i
/// for i in 0..=10 (1 KiB, 4 KiB, ... 1 GiB), as KOReader and readup do.
const CHUNK: u64 = 1024;

pub(crate) fn hex(bytes: &[u8]) -> String {
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
    .ok_or_else(|| {
      std::io::Error::new(std::io::ErrorKind::NotFound, "no such file")
    })?
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
pub async fn read_file_bytes(
  file_path: String,
) -> Result<tauri::ipc::Response, String> {
  let bytes = tauri::async_runtime::spawn_blocking(move || {
    LocalFs.read(Path::new(&file_path))
  })
  .await
  .map_err(|e| e.to_string())?
  .map_err(|e| e.to_string())?;
  Ok(tauri::ipc::Response::new(bytes))
}

/// `len` bytes of a file from `start`, fewer at its end, sent as binary: a
/// dictionary file read where its index says, not whole (they are big).
#[tauri::command]
pub async fn read_file_range(
  file_path: String,
  start: u64,
  len: u64,
) -> Result<tauri::ipc::Response, String> {
  let bytes = tauri::async_runtime::spawn_blocking(move || {
    LocalFs.read_range(Path::new(&file_path), start, len)
  })
  .await
  .map_err(|e| e.to_string())?
  .map_err(|e| e.to_string())?;
  Ok(tauri::ipc::Response::new(bytes))
}

/// The book files open in the reader, by id: read by parts as it asks (see
/// RangeBook of src/reader/document.ts), not all of a big book in memory.
/// Open, the file is read as it was, even moved, renamed or written again.
static OPEN_BOOKS: LazyLock<Mutex<OpenBooks>> = LazyLock::new(Default::default);

/// The most book files open; the first opened closed for another.
const MAX_OPEN_BOOKS: usize = 16;

#[derive(Default)]
struct OpenBooks {
  next: u32,
  files: VecDeque<(u32, Arc<Mutex<File>>)>,
}

#[derive(Serialize)]
pub struct OpenBook {
  id: u32,
  size: u64,
}

/// A book file open, to read by parts (`read_book_file`); closed by
/// `close_book_file`.
#[tauri::command]
pub async fn open_book_file(file_path: String) -> Result<OpenBook, String> {
  let file = File::open(&file_path).map_err(|e| e.to_string())?;
  let size = file.metadata().map_err(|e| e.to_string())?.len();
  let mut open = OPEN_BOOKS.lock().map_err(|e| e.to_string())?;
  open.next = open.next.wrapping_add(1);
  let id = open.next;
  if open.files.len() >= MAX_OPEN_BOOKS {
    open.files.pop_front();
  }
  open.files.push_back((id, Arc::new(Mutex::new(file))));
  Ok(OpenBook { id, size })
}

/// `len` bytes from `start` of a book file open, fewer at its end, sent as
/// binary.
#[tauri::command]
pub async fn read_book_file(
  id: u32,
  start: u64,
  len: u64,
) -> Result<tauri::ipc::Response, String> {
  let file = OPEN_BOOKS
    .lock()
    .map_err(|e| e.to_string())?
    .files
    .iter()
    .find(|(i, _)| *i == id)
    .map(|(_, f)| f.clone())
    .ok_or_else(|| format!("the book file {id} is not open"))?;
  let bytes =
    tauri::async_runtime::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
      let mut file = file
        .lock()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
      file.seek(SeekFrom::Start(start))?;
      let mut bytes = Vec::with_capacity(len.min(64 << 20) as usize);
      (&mut *file).take(len).read_to_end(&mut bytes)?;
      Ok(bytes)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
  Ok(tauri::ipc::Response::new(bytes))
}

/// A book file open closed.
#[tauri::command]
pub fn close_book_file(id: u32) {
  if let Ok(mut open) = OPEN_BOOKS.lock() {
    open.files.retain(|(i, _)| *i != id);
  }
}

/// The images of a book file (EPUB) made smaller, see book_images.rs; how
/// many, the file written again if any. A feed book made with them as big as
/// the site has them.
#[tauri::command]
pub async fn shrink_book_images(file_path: String) -> Result<usize, String> {
  let path = file_path.clone();
  tauri::async_runtime::spawn_blocking(move || {
    crate::book_images::shrink_book_file(Path::new(&path))
  })
  .await
  .map_err(|e| e.to_string())?
  .inspect_err(|e| {
    log_error(format!("Error on [shrink_book_images, {file_path}]: {e}"))
  })
}

/// Write bytes to a file, e.g. the cover of a book cached.
#[tauri::command]
pub async fn write_file_bytes(file_path: String, data: Vec<u8>) -> bool {
  LocalFs.write_atomic(Path::new(&file_path), &data).is_ok()
}

/// Write the bytes of the request, sent as binary (a big book), to the file
/// of its `file-path` header, percent encoded: not as a JSON array of numbers.
#[tauri::command]
pub async fn write_file_raw(
  request: tauri::ipc::Request<'_>,
) -> Result<bool, String> {
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
    let dir =
      std::env::temp_dir().join(format!("mdsilo-books-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let small = dir.join("small.epub");
    fs::write(&small, b"hello").unwrap();
    // the whole of a small file
    assert_eq!(
      partial_md5(&LocalFs, &small).unwrap(),
      "5d41402abc4b2a76b9719d911017c592"
    );

    // chunks at 0, 1 KiB and 4 KiB of a 5000 bytes file
    let data: Vec<u8> = (0..5000u32).map(|i| (i % 251) as u8).collect();
    let big = dir.join("big.pdf");
    fs::write(&big, &data).unwrap();
    let mut expected = Md5::new();
    expected.update(&data[0..1024]);
    expected.update(&data[1024..2048]);
    expected.update(&data[4096..5000]);
    assert_eq!(
      partial_md5(&LocalFs, &big).unwrap(),
      hex(&expected.finalize())
    );

    assert!(partial_md5(&LocalFs, &dir.join("missing")).is_err());
    fs::remove_dir_all(&dir).unwrap();
  }
}
