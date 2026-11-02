//! The book files read here, not in the webview: their metadata and cover
//! for the library, their text for the search, without the book opened.
//! EPUB, MOBI/AZW/AZW3 and FB2/FBZ, as foliate-js reads them
//! (packages/foliate-js): the same sections, CFIs and labels, so that a hit
//! of the search opens where the reader puts it. Others (PDF, comics): none,
//! the webview reads them as before.

mod epub;
mod fb2;
mod mobi;
mod tree;

use crate::index;
use crate::storage::log_error;
use crate::wsfs::{LocalFs, WorkspaceFs};
use serde::Serialize;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

/// The metadata of a book, as BookMeta of src/reader/library/library.ts.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookMeta {
  pub title: String,
  pub author: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub subtitle: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub series: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub series_index: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub publisher: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub published: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub language: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub identifier: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub subjects: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
}

/// A section of a book: its CFI as the reader makes it, the label of the
/// table of contents it is under, its text (empty if none).
#[derive(Debug, Clone, PartialEq)]
pub struct Section {
  pub cfi: String,
  pub label: String,
  pub text: String,
}

/// An entry of the table of contents.
#[derive(Debug, Clone, Default)]
pub struct TocItem {
  pub label: String,
  pub href: String,
  pub subitems: Vec<TocItem>,
}

/// The CFI of a section of a book that has none of its own, as sectionCfi
/// of src/reader/bookIndex.ts.
fn index_cfi(index: usize) -> String {
  format!("epubcfi(/6/{})", (index + 1) * 2)
}

/// The label of each section, as sectionLabels of src/reader/bookIndex.ts:
/// of the first entry of the table of contents in it; else of the section
/// before.
fn label_sections(
  toc: &[TocItem],
  count: usize,
  index_of: impl Fn(&str) -> Option<usize>,
) -> Vec<String> {
  let mut labels: Vec<Option<String>> = vec![None; count];
  fn walk(
    items: &[TocItem],
    labels: &mut [Option<String>],
    index_of: &dyn Fn(&str) -> Option<usize>,
  ) {
    for item in items {
      let label = item.label.trim();
      if let Some(i) = index_of(&item.href)
        && i < labels.len()
        && labels[i].is_none()
        && !label.is_empty()
      {
        labels[i] = Some(label.to_string());
      }
      walk(&item.subitems, labels, index_of);
    }
  }
  walk(toc, &mut labels, &index_of);
  let mut last = String::new();
  labels
    .into_iter()
    .map(|label| {
      if let Some(label) = label {
        last.clone_from(&label);
        label
      } else {
        last.clone()
      }
    })
    .collect()
}

/// The number at the start of a string, as `parseFloat` in JavaScript.
fn parse_float(s: &str) -> Option<f64> {
  use std::sync::LazyLock;
  static NUMBER: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?").unwrap()
  });
  let s = s.trim_start_matches(tree::is_js_space);
  NUMBER
    .find(s)
    .and_then(|m| m.as_str().parse::<f64>().ok())
    .filter(|n| n.is_finite())
}

/// A book file open.
pub enum Book {
  Epub(epub::Epub<BufReader<File>>),
  Mobi(mobi::Mobi),
  Fb2(fb2::Fb2),
}

fn ext_of(path: &Path) -> String {
  path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or_default()
    .to_lowercase()
}

impl Book {
  /// Open a book file, by its content (its name for the zip based formats),
  /// as openBook of src/reader/document.ts. An error for the formats not
  /// read here.
  pub fn open(path: &Path) -> Result<(Self, &'static str), String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut head = [0u8; 68];
    let n = file.read(&mut head).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or_default()
      .to_lowercase();
    let ext = ext_of(path);
    if n >= 3 && head[..3] == *b"PK\x03" || n >= 4 && head[..4] == *b"PK\x05\x06" {
      if ext == "cbz" {
        return Err("comic books are read in the webview".into());
      }
      if name.ends_with(".fbz")
        || name.ends_with(".fb2.zip")
        || name.ends_with(".fb.zip")
      {
        let mut zip = epub::Zip::new(BufReader::new(file))?;
        let entry = zip
          .names
          .iter()
          .find(|n| n.ends_with(".fb2"))
          .or(zip.names.first())
          .cloned()
          .ok_or("empty archive")?;
        let data = zip.bytes(&entry).ok_or("no FB2 in the archive")?;
        return Ok((Book::Fb2(fb2::Fb2::open(&data)?), "FBZ"));
      }
      return Ok((Book::Epub(epub::Epub::open(BufReader::new(file))?), "EPUB"));
    }
    if n >= 5 && head[..5] == *b"%PDF-" {
      return Err("PDF is read in the webview".into());
    }
    if n >= 68 && head[60..68] == *b"BOOKMOBI" {
      let mut data = Vec::new();
      file.read_to_end(&mut data).map_err(|e| e.to_string())?;
      let format = match ext.as_str() {
        "azw" => "AZW",
        "azw3" => "AZW3",
        _ => "MOBI",
      };
      return Ok((Book::Mobi(mobi::Mobi::open(data)?), format));
    }
    if ext == "fb2" {
      let mut data = Vec::new();
      file.read_to_end(&mut data).map_err(|e| e.to_string())?;
      return Ok((Book::Fb2(fb2::Fb2::open(&data)?), "FB2"));
    }
    Err("Unsupported book format".into())
  }

  /// The metadata, the title of the file name if it has none.
  pub fn meta(&self, path: &Path) -> BookMeta {
    let mut meta = match self {
      Book::Epub(b) => b.meta(),
      Book::Mobi(b) => b.meta(),
      Book::Fb2(b) => b.meta(),
    };
    if meta.title.is_empty() {
      meta.title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    }
    meta
  }

  pub fn cover(&mut self) -> Option<Vec<u8>> {
    match self {
      Book::Epub(b) => b.cover(),
      Book::Mobi(b) => b.cover(),
      Book::Fb2(b) => b.cover(),
    }
  }

  /// Of fixed layout: pages, not text.
  pub fn fixed_layout(&mut self) -> bool {
    match self {
      Book::Epub(b) => b.fixed_layout(),
      Book::Mobi(b) => b.fixed_layout(),
      Book::Fb2(_) => false,
    }
  }

  pub fn sections(&mut self) -> Vec<Section> {
    match self {
      Book::Epub(b) => b.sections(),
      Book::Mobi(b) => b.sections(),
      Book::Fb2(b) => b.sections(),
    }
  }
}

/// The height of the covers cached, as COVER_HEIGHT of
/// src/reader/library/covers.ts.
const COVER_HEIGHT: f64 = 320.0;

/// A smaller JPEG of a cover, as the webview makes them: transparent pixels
/// black, as on a canvas. None if not an image read here (e.g. SVG).
pub fn thumbnail(bytes: &[u8]) -> Option<Vec<u8>> {
  let image = image::load_from_memory(bytes).ok()?;
  let (w, h) = (image.width() as f64, image.height() as f64);
  let scale = (COVER_HEIGHT / h).min(1.0);
  let image = if scale < 1.0 {
    image.resize_exact(
      ((w * scale).round() as u32).max(1),
      ((h * scale).round() as u32).max(1),
      image::imageops::FilterType::Triangle,
    )
  } else {
    image
  };
  let rgba = image.to_rgba8();
  let rgb = image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
    let [r, g, b, a] = rgba.get_pixel(x, y).0;
    let over = |c: u8| ((c as u16 * a as u16 + 127) / 255) as u8;
    image::Rgb([over(r), over(g), over(b)])
  });
  let mut out = Vec::new();
  image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 80)
    .encode_image(&rgb)
    .ok()?;
  Some(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
  /// as BookFormat of src/reader/document.ts
  pub format: &'static str,
  pub meta: BookMeta,
  /// the cover is cached
  pub cover: bool,
  pub fixed_layout: bool,
}

fn book_info_of(path: &Path, cover_path: Option<&Path>) -> Result<BookInfo, String> {
  let (mut book, format) = Book::open(path)?;
  let meta = book.meta(path);
  let cover = match cover_path {
    Some(to) if LocalFs.stat(to).is_some() => true,
    Some(to) => book
      .cover()
      .and_then(|bytes| thumbnail(&bytes))
      .is_some_and(|small| LocalFs.write_atomic(to, &small).is_ok()),
    None => false,
  };
  Ok(BookInfo {
    format,
    meta,
    cover,
    fixed_layout: book.fixed_layout(),
  })
}

/// The metadata of a book file, its cover cached at `cover_path` unless it is
/// there already. None if the book is not read here: the webview reads it.
#[tauri::command]
pub async fn book_info(
  file_path: String,
  cover_path: Option<String>,
) -> Option<BookInfo> {
  tauri::async_runtime::spawn_blocking(move || {
    book_info_of(Path::new(&file_path), cover_path.as_deref().map(Path::new))
      .inspect_err(|e| log_error(format!("Error on [book_info, {file_path}]: {e}")))
      .ok()
  })
  .await
  .ok()
  .flatten()
}

/// The sections of a book with text, for the search.
pub fn text_sections(path: &Path) -> Result<Vec<index::BookSection>, String> {
  let (mut book, _) = Book::open(path)?;
  if book.fixed_layout() {
    return Ok(Vec::new());
  }
  Ok(
    book
      .sections()
      .into_iter()
      .filter(|s| !s.text.is_empty())
      .map(|s| index::BookSection {
        cfi: s.cfi,
        label: s.label,
        text: s.text,
      })
      .collect(),
  )
}

/// Index the text of a book file for the search, unless it is already (or
/// `force`). False if the book is not read here: the webview indexes it once
/// opened, see src/reader/bookIndex.ts.
#[tauri::command]
pub async fn book_index_text(
  file_path: String,
  hash: String,
  title: String,
  force: bool,
) -> bool {
  tauri::async_runtime::spawn_blocking(move || {
    if !force && index::book_is_indexed(&hash) {
      return true;
    }
    let sections = match text_sections(Path::new(&file_path)) {
      Ok(sections) => sections,
      Err(e) => {
        log_error(format!("Error on [book_index_text, {file_path}]: {e}"));
        return false;
      }
    };
    if sections.is_empty() {
      return true;
    }
    index::index_book_sections(&hash, &title, &sections)
      .inspect_err(|e| {
        log_error(format!("Error on [book_index_text, {file_path}]: {e}"))
      })
      .is_ok()
  })
  .await
  .unwrap_or(false)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn labels_the_sections() {
    let item = |label: &str, href: &str, subitems| TocItem {
      label: label.into(),
      href: href.into(),
      subitems,
    };
    let toc = vec![
      item(
        "",
        "1",
        vec![item(" One ", "1#a", vec![]), item("x", "1#b", vec![])],
      ),
      item("Three", "3", vec![]),
      item("Again", "1", vec![]),
    ];
    let labels =
      label_sections(&toc, 5, |href| href.split('#').next()?.parse().ok());
    assert_eq!(labels, ["", "One", "One", "Three", "Three"]);
  }

  #[test]
  fn parses_floats_as_javascript() {
    assert_eq!(parse_float(" 2.5x"), Some(2.5));
    assert_eq!(parse_float("3"), Some(3.0));
    assert_eq!(parse_float(".5"), Some(0.5));
    assert_eq!(parse_float("2.2.1"), Some(2.2));
    assert_eq!(parse_float("abc"), None);
    assert_eq!(parse_float(""), None);
  }

  /// Each book read as foliate-js reads it, by the references in the folder
  /// MDSILO_BOOK_REFS, made by src/reader/foliateRefs.test.ts: the format,
  /// metadata, cover and sections of each book. The sections of KF8 not
  /// well-formed XHTML differ: foliate's text of them is the error of its XML
  /// parser, the text here.
  #[test]
  #[ignore]
  fn reads_books_as_foliate() {
    use md5::{Digest, Md5};
    let Ok(dir) = std::env::var("MDSILO_BOOK_REFS") else {
      return;
    };
    let mut failures = Vec::new();
    for entry in std::fs::read_dir(dir).unwrap() {
      let reference: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(entry.unwrap().path()).unwrap(),
      )
      .unwrap();
      let path = Path::new(reference["path"].as_str().unwrap());
      let name = path.file_name().unwrap().to_string_lossy().to_string();
      let mut fail = |what: String| failures.push(format!("{name}: {what}"));
      let (mut book, format) = match Book::open(path) {
        Ok(b) => b,
        Err(e) => {
          fail(format!("not open: {e}"));
          continue;
        }
      };
      if format != reference["format"] {
        fail(format!("format {format}"));
      }
      let meta = serde_json::to_value(book.meta(path)).unwrap();
      for (key, want) in reference["meta"].as_object().unwrap() {
        if meta.get(key) != Some(want) {
          fail(format!("meta {key}: {:?} != {want}", meta.get(key)));
        }
      }
      for key in meta.as_object().unwrap().keys() {
        if reference["meta"].get(key).is_none() {
          fail(format!("meta {key}: {} not in foliate's", meta[key]));
        }
      }
      if let Book::Epub(epub) = &book {
        if epub.cover_href().as_deref() != reference["coverHref"].as_str() {
          fail(format!("cover {:?}", epub.cover_href()));
        }
      } else {
        let cover = book.cover().map(|c| crate::books::hex(&Md5::digest(&c)));
        if cover.as_deref() != reference["cover"]["md5"].as_str() {
          fail(format!("cover {cover:?}"));
        }
      }
      let want = reference["sections"].as_array().unwrap();
      let got = if reference["layout"] == "pre-paginated" {
        Vec::new()
      } else {
        book.sections()
      };
      if !want.is_empty() && got.len() != want.len() {
        fail(format!("{} sections, not {}", got.len(), want.len()));
        continue;
      }
      let (mut texts, mut labels, mut errors) = (0, 0, 0);
      for (i, (got, want)) in got.iter().zip(want).enumerate() {
        if got.cfi != want["cfi"] {
          fail(format!("section {i} cfi {} != {}", got.cfi, want["cfi"]));
        }
        // a label where foliate has none: in jsdom, no innerText (of MOBI6);
        // a table of contents not well-formed, read here
        if got.label != want["label"] && want["label"] != "" {
          labels += 1;
          if labels <= 3 {
            fail(format!(
              "section {i} label {:?} != {}",
              got.label, want["label"]
            ));
          }
        }
        let want = want["text"].as_str().unwrap();
        if got.text != want {
          // foliate's XML parser failing: its error as the text
          if want.len() < 200 && want.contains(": ") && !got.text.contains(want) {
            errors += 1;
            continue;
          }
          texts += 1;
          if texts <= 3 {
            let at = got
              .text
              .chars()
              .zip(want.chars())
              .take_while(|(a, b)| a == b)
              .count();
            let around = |s: &str| {
              s.chars()
                .skip(at.saturating_sub(30))
                .take(80)
                .collect::<String>()
            };
            fail(format!(
              "section {i} text differs at {at}, {} / {} chars:\n    rust: {:?}\n    foli: {:?}",
              got.text.chars().count(),
              want.chars().count(),
              around(&got.text),
              around(want)
            ));
          }
        }
      }
      if texts + labels > 0 {
        fail(format!(
          "{texts} texts, {labels} labels differ; {errors} of foliate's XML errors"
        ));
      }
    }
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
  }

  #[test]
  fn makes_thumbnails() {
    let mut png = Vec::new();
    image::RgbaImage::from_pixel(100, 640, image::Rgba([255, 0, 0, 255]))
      .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
      .unwrap();
    let small = image::load_from_memory(&thumbnail(&png).unwrap()).unwrap();
    assert_eq!((small.width(), small.height()), (50, 320));
    assert!(thumbnail(b"<svg/>").is_none());
  }
}
