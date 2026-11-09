//! The images of a book made smaller: the photos of a feed book come as big
//! as the site has them (a 18 megapixel one, 8 MB), and a reader decodes all
//! of an article's at once, slow, its memory spent, the webview even blank.

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader};
use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// The widest an image in a book is, in pixels: more than a page of the
/// reader shows, on a HiDPI screen too.
pub const MAX_WIDTH: u32 = 1600;

/// The most pixels of an image in a book, MAX_WIDTH x MAX_WIDTH: a tall one
/// (an infographic) narrower then, not as narrow as a cap on its height would
/// make it, its text still read.
const MAX_AREA: f64 = (MAX_WIDTH as f64) * (MAX_WIDTH as f64);

/// How much an image `w` x `h` is made smaller: within MAX_WIDTH and
/// MAX_AREA, its ratio kept; 1 if it is.
fn scale_of(w: u32, h: u32) -> f64 {
  let (w, h) = (f64::from(w.max(1)), f64::from(h.max(1)));
  (f64::from(MAX_WIDTH) / w)
    .min((MAX_AREA / (w * h)).sqrt())
    .min(1.0)
}

/// An image small enough but bigger than this, in bytes: encoded again.
const MAX_BYTES: usize = 1 << 20;

/// An image of a book no bigger than this, in bytes: not even looked at
/// when a book is made smaller, a big one would be bigger.
const SMALL_BYTES: u64 = 256 << 10;

const JPEG_QUALITY: u8 = 82;

/// The most pixels of an image decoded: one bigger left as it is.
const MAX_PIXELS: u64 = 120_000_000;

/// A smaller image of `bytes`: within MAX_WIDTH and MAX_AREA, turned as its
/// EXIF says (the encoded one has no EXIF). A JPEG stays a JPEG and a PNG a
/// PNG, unless `to_jpeg` lets an opaque PNG be a JPEG. None if not smaller,
/// small already, or not a JPEG or a PNG (a GIF may be animated).
pub fn shrink(bytes: &[u8], to_jpeg: bool) -> Option<Vec<u8>> {
  let format = image::guess_format(bytes).ok()?;
  if !matches!(format, ImageFormat::Jpeg | ImageFormat::Png) {
    return None;
  }
  let (w, h) = ImageReader::with_format(Cursor::new(bytes), format)
    .into_dimensions()
    .ok()?;
  // as stored, before its EXIF turns it: either way
  let maybe_big = scale_of(w, h) < 1.0 || scale_of(h, w) < 1.0;
  if !maybe_big && bytes.len() <= MAX_BYTES {
    return None;
  }
  if u64::from(w) * u64::from(h) > MAX_PIXELS {
    return None;
  }
  let mut decoder = ImageReader::with_format(Cursor::new(bytes), format)
    .into_decoder()
    .ok()?;
  let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
  let mut image = DynamicImage::from_decoder(decoder).ok()?;
  image.apply_orientation(orientation);
  let scale = scale_of(image.width(), image.height());
  let too_big = scale < 1.0;
  if !too_big && bytes.len() <= MAX_BYTES {
    return None;
  }
  if too_big {
    let size = |n: u32| ((f64::from(n) * scale).round() as u32).max(1);
    image = image.resize_exact(
      size(image.width()),
      size(image.height()),
      FilterType::CatmullRom,
    );
  }
  let as_jpeg = format == ImageFormat::Jpeg || (to_jpeg && is_opaque(&image));
  let mut out = Vec::new();
  if as_jpeg {
    JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
      .encode_image(&image.to_rgb8())
      .ok()?;
  } else {
    image
      .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
      .ok()?;
  }
  // small enough, encoded again only if much smaller: not again and again,
  // a bit smaller each time, as the book is written again
  let worth = if too_big {
    out.len() < bytes.len()
  } else {
    out.len() * 4 < bytes.len() * 3
  };
  worth.then_some(out)
}

fn is_opaque(image: &DynamicImage) -> bool {
  !image.color().has_alpha() || image.to_rgba8().pixels().all(|p| p.0[3] == 255)
}

fn is_image_name(name: &str) -> bool {
  let lower = name.to_ascii_lowercase();
  [".jpg", ".jpeg", ".png"]
    .iter()
    .any(|ext| lower.ends_with(ext))
}

/// The images of an EPUB (or any zip) made smaller, see `shrink`: the zip of
/// them, its other files as they are; None if none is made smaller. Each
/// image keeps its name and format, as the book refers to them.
pub fn shrink_zip(bytes: &[u8]) -> Result<Option<(Vec<u8>, usize)>, String> {
  let mut archive =
    ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
  let mut images: Vec<(usize, Vec<u8>)> = Vec::new();
  for i in 0..archive.len() {
    let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
    let name = entry.name().map_err(|e| e.to_string())?;
    if !entry.is_file() || entry.size() <= SMALL_BYTES || !is_image_name(&name) {
      continue;
    }
    drop(name);
    let mut data = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
    images.push((i, data));
  }
  let smaller = shrink_all(images);
  if smaller.is_empty() {
    return Ok(None);
  }
  let mut out = ZipWriter::new(Cursor::new(Vec::with_capacity(bytes.len())));
  for i in 0..archive.len() {
    if let Some(data) = smaller.get(&i) {
      let entry = archive.by_index(i).map_err(|e| e.to_string())?;
      let mut options =
        SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
      if let Some(time) = entry.last_modified() {
        options = options.last_modified_time(time);
      }
      let name = entry.name().map_err(|e| e.to_string())?.to_string();
      drop(entry);
      out.start_file(name, options).map_err(|e| e.to_string())?;
      out.write_all(data).map_err(|e| e.to_string())?;
    } else {
      // as it is, compressed or not: the mimetype of an EPUB stays first, stored
      let entry = archive.by_index_raw(i).map_err(|e| e.to_string())?;
      out.raw_copy_file(entry).map_err(|e| e.to_string())?;
    }
  }
  let zip = out.finish().map_err(|e| e.to_string())?.into_inner();
  Ok(Some((zip, smaller.len())))
}

/// The images made smaller on all the cores: by their index in the zip.
fn shrink_all(images: Vec<(usize, Vec<u8>)>) -> HashMap<usize, Vec<u8>> {
  let threads = std::thread::available_parallelism()
    .map_or(2, |n| n.get())
    .min(images.len().max(1));
  let next = std::sync::atomic::AtomicUsize::new(0);
  let images = &images;
  std::thread::scope(|scope| {
    let workers: Vec<_> = (0..threads)
      .map(|_| {
        scope.spawn(|| {
          let mut done = Vec::new();
          loop {
            let k = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let Some((i, data)) = images.get(k) else {
              break;
            };
            if let Some(small) = shrink(data, false) {
              done.push((*i, small));
            }
          }
          done
        })
      })
      .collect();
    workers
      .into_iter()
      .flat_map(|w| w.join().unwrap_or_default())
      .collect()
  })
}

/// The images of the book file made smaller, the file written again (at
/// once); how many. A book of a feed made before its images were.
pub fn shrink_book_file(path: &Path) -> Result<usize, String> {
  let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
  match shrink_zip(&bytes)? {
    Some((zip, n)) => {
      crate::atomic::write_atomic(path, &zip).map_err(|e| e.to_string())?;
      Ok(n)
    }
    None => Ok(0),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn jpeg(w: u32, h: u32) -> Vec<u8> {
    let image = image::RgbImage::from_fn(w, h, |x, y| {
      image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x ^ y) % 256) as u8])
    });
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 95)
      .encode_image(&image)
      .unwrap();
    out
  }

  fn png(w: u32, h: u32, alpha: u8) -> Vec<u8> {
    // noisy, as a photo: not smaller as a pattern is at its full size
    let mut seed = 1u32;
    let image = image::RgbaImage::from_fn(w, h, |_, _| {
      seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
      let [r, g, b, _] = seed.to_le_bytes();
      image::Rgba([r, g, b, alpha])
    });
    let mut out = Vec::new();
    image
      .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
      .unwrap();
    out
  }

  fn dims(bytes: &[u8]) -> (u32, u32) {
    image::load_from_memory(bytes)
      .unwrap()
      .into_rgb8()
      .dimensions()
  }

  #[test]
  fn test_shrink_big_jpeg() {
    let big = jpeg(4000, 2000);
    let small = shrink(&big, false).expect("made smaller");
    assert_eq!(image::guess_format(&small).unwrap(), ImageFormat::Jpeg);
    assert_eq!(dims(&small), (1600, 800));
    assert!(small.len() < big.len());
  }

  #[test]
  fn test_shrink_tall_image() {
    // an infographic: narrower, within the area, not 1600 high
    let tall = jpeg(1000, 6000);
    let small = shrink(&tall, false).expect("made smaller");
    assert_eq!(dims(&small), (653, 3919));
    assert_eq!(scale_of(1200, 800), 1.0);
    assert_eq!(scale_of(1600, 1600), 1.0);
  }

  #[test]
  fn test_shrink_leaves_small_ones() {
    assert!(shrink(&jpeg(800, 600), false).is_none());
    assert!(shrink(b"GIF89a not really", false).is_none());
    assert!(shrink(b"not an image", false).is_none());
  }

  #[test]
  fn test_shrink_png_format() {
    // opaque: a JPEG only if let
    let opaque = png(3200, 1600, 255);
    let kept = shrink(&opaque, false).unwrap();
    assert_eq!(image::guess_format(&kept).unwrap(), ImageFormat::Png);
    assert_eq!(dims(&kept), (1600, 800));
    let to_jpeg = shrink(&opaque, true).unwrap();
    assert_eq!(image::guess_format(&to_jpeg).unwrap(), ImageFormat::Jpeg);
    // transparent: a PNG still
    let clear = shrink(&png(3200, 1600, 100), true).unwrap();
    assert_eq!(image::guess_format(&clear).unwrap(), ImageFormat::Png);
  }

  #[test]
  fn test_shrink_zip() {
    let big = jpeg(3000, 3000);
    let small = jpeg(300, 300);
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
      SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file("mimetype", stored).unwrap();
    zip.write_all(b"application/epub+zip").unwrap();
    zip
      .start_file("OEBPS/a.xhtml", SimpleFileOptions::default())
      .unwrap();
    zip
      .write_all(b"<html><img src=\"a/1.jpg\"/></html>")
      .unwrap();
    zip.start_file("OEBPS/a/1.jpg", stored).unwrap();
    zip.write_all(&big).unwrap();
    zip.start_file("OEBPS/a/2.jpg", stored).unwrap();
    zip.write_all(&small).unwrap();
    let bytes = zip.finish().unwrap().into_inner();

    let (out, n) = shrink_zip(&bytes).unwrap().expect("made smaller");
    assert_eq!(n, 1);
    assert!(out.len() < bytes.len());
    let mut archive = ZipArchive::new(Cursor::new(&out)).unwrap();
    let names: Vec<_> = archive
      .file_names()
      .map(|n| n.unwrap().to_string())
      .collect();
    assert_eq!(names[0], "mimetype");
    assert_eq!(names.len(), 4);
    let mut read = |name: &str| {
      let mut data = Vec::new();
      archive
        .by_name(name)
        .unwrap()
        .read_to_end(&mut data)
        .unwrap();
      data
    };
    assert_eq!(read("mimetype"), b"application/epub+zip");
    assert_eq!(dims(&read("OEBPS/a/1.jpg")), (1600, 1600));
    assert_eq!(read("OEBPS/a/2.jpg"), small);
    // made smaller once: nothing to do again
    assert!(shrink_zip(&out).unwrap().is_none());
  }
}
