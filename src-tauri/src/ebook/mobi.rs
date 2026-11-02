//! MOBI, AZW and AZW3 (KF8), as foliate-js reads them
//! (packages/foliate-js/mobi.js): MOBI6 split at its page breaks, KF8 by
//! its skeletons and fragments.

use super::tree::{normalize_ws, parse_html, parse_xml, text_of, unescape_html};
use super::{BookMeta, Section, TocItem, index_cfi, label_sections};
use encoding_rs::{Encoding, UTF_8, WINDOWS_1252};
use regex::Regex;
use regex::bytes::Regex as BytesRegex;
use std::collections::HashMap;
use std::sync::LazyLock;

const NONE: u32 = 0xffff_ffff;

fn uint(buf: &[u8], start: usize, len: usize) -> u32 {
  match buf.get(start..start + len) {
    Some(b) => b.iter().fold(0u32, |v, x| (v << 8) | *x as u32),
    None => 0,
  }
}

fn bytes_at(buf: &[u8], start: usize, end: usize) -> &[u8] {
  let end = end.min(buf.len());
  buf.get(start.min(end)..end).unwrap_or_default()
}

/// A variable-length number, and the bytes it takes.
fn var_len(buf: &[u8], i: usize) -> (u32, usize) {
  let mut value = 0u32;
  let mut length = 0;
  for byte in bytes_at(buf, i, i + 4) {
    value = (value << 7) | (*byte as u32 & 0x7f);
    length += 1;
    if byte & 0x80 != 0 {
      break;
    }
  }
  (value, length)
}

/// A variable-length number at the end, read backwards.
fn var_len_from_end(buf: &[u8]) -> u32 {
  let mut value = 0u32;
  for byte in &buf[buf.len().saturating_sub(4)..] {
    if byte & 0x80 != 0 {
      value = 0;
    }
    value = (value << 7) | (*byte as u32 & 0x7f);
  }
  value
}

fn decompress_palmdoc(data: &[u8]) -> Vec<u8> {
  let mut out: Vec<u8> = Vec::with_capacity(data.len() * 2);
  let mut i = 0;
  while i < data.len() {
    let byte = data[i];
    match byte {
      0 => out.push(0),
      1..=8 => {
        out.extend_from_slice(bytes_at(data, i + 1, i + 1 + byte as usize));
        i += byte as usize;
      }
      9..=0x7f => out.push(byte),
      0x80..=0xbf => {
        let pair = ((byte as u32) << 8) | *data.get(i + 1).unwrap_or(&0) as u32;
        i += 1;
        let distance = ((pair & 0x3fff) >> 3) as usize;
        let length = (pair & 7) + 3;
        for _ in 0..length {
          let c = out
            .len()
            .checked_sub(distance)
            .filter(|_| distance > 0)
            .map(|j| out[j]);
          out.push(c.unwrap_or(0));
        }
      }
      _ => {
        out.push(b' ');
        out.push(byte ^ 0x80);
      }
    }
    i += 1;
  }
  out
}

/// The HUFF/CDIC decompressor.
struct Huff {
  /// by byte: found, the code length, the value
  table1: Vec<(bool, u32, u32)>,
  /// by code length
  table2: Vec<(u32, u32)>,
  dictionary: Vec<(Vec<u8>, bool)>,
}

fn read32_bits(data: &[u8], from: usize) -> u32 {
  let start = from >> 3;
  let end = from + 32;
  let mut bits = 0u64;
  for i in start..=(end >> 3) {
    bits = (bits << 8) | *data.get(i).unwrap_or(&0) as u64;
  }
  ((bits >> (8 - (end & 7))) & 0xffff_ffff) as u32
}

impl Huff {
  fn new(huff: &[u8], cdics: &[&[u8]]) -> Result<Self, String> {
    if bytes_at(huff, 0, 4) != b"HUFF" {
      return Err("Invalid HUFF record".into());
    }
    let (offset1, offset2) = (uint(huff, 8, 4) as usize, uint(huff, 12, 4) as usize);
    let table1 = (0..256)
      .map(|i| {
        let x = uint(huff, offset1 + i * 4, 4);
        (x & 0x80 != 0, x & 0x1f, x >> 8)
      })
      .collect();
    let table2 = std::iter::once((0, 0))
      .chain((0..32).map(|i| {
        let o = offset2 + i * 8;
        (uint(huff, o, 4), uint(huff, o + 4, 4))
      }))
      .collect();
    let mut dictionary = Vec::new();
    for record in cdics {
      if bytes_at(record, 0, 4) != b"CDIC" {
        return Err("Invalid CDIC record".into());
      }
      let (length, entries, code_length) = (
        uint(record, 4, 4) as usize,
        uint(record, 8, 4) as usize,
        uint(record, 12, 4),
      );
      let n = (1usize << code_length.min(31))
        .min(entries.saturating_sub(dictionary.len()));
      let buf = bytes_at(record, length, record.len());
      for i in 0..n {
        let offset = uint(buf, i * 2, 2) as usize;
        let x = uint(buf, offset, 2);
        let len = (x & 0x7fff) as usize;
        dictionary.push((
          bytes_at(buf, offset + 2, offset + 2 + len).to_vec(),
          x & 0x8000 != 0,
        ));
      }
    }
    Ok(Self {
      table1,
      table2,
      dictionary,
    })
  }

  fn decompress(&mut self, data: &[u8], depth: usize) -> Vec<u8> {
    let mut out = Vec::new();
    let bit_length = data.len() * 8;
    let mut i = 0;
    while i < bit_length && depth < 32 {
      let bits = read32_bits(data, i) as u64;
      let (found, mut code_length, mut value) = self.table1[(bits >> 24) as usize];
      if !found {
        while (code_length as usize) < 32
          && (bits >> (32 - code_length))
            < self.table2[code_length as usize].0 as u64
        {
          code_length += 1;
        }
        value = self.table2[code_length.min(32) as usize].1;
      }
      if code_length == 0 {
        break;
      }
      i += code_length as usize;
      if i > bit_length {
        break;
      }
      let Some(code) = (value as u64).checked_sub(bits >> (32 - code_length)) else {
        break;
      };
      let Some((result, done)) = self.dictionary.get(code as usize).cloned() else {
        break;
      };
      if done {
        out.extend_from_slice(&result);
      } else {
        let result = self.decompress(&result, depth + 1);
        out.extend_from_slice(&result);
        self.dictionary[code as usize] = (result, true);
      }
    }
    out
  }
}

#[derive(Debug, Default)]
struct Exth {
  strings: HashMap<u32, Vec<String>>,
  uints: HashMap<u32, u32>,
}

impl Exth {
  fn one(&self, kind: u32) -> Option<&str> {
    self
      .strings
      .get(&kind)
      .and_then(|v| v.last())
      .map(String::as_str)
  }
  fn all(&self, kind: u32) -> Option<&[String]> {
    self.strings.get(&kind).map(Vec::as_slice)
  }
}

/// The EXTH records kept: of a number, of one string, of many.
const EXTH_UINT: &[u32] = &[121, 125, 201, 202];
const EXTH_MANY: &[u32] = &[100, 105, 108, 110, 112, 524];

fn decoder(encoding: u32) -> &'static Encoding {
  if encoding == 1252 {
    WINDOWS_1252
  } else {
    UTF_8
  }
}

fn decode(encoding: &'static Encoding, bytes: &[u8]) -> String {
  encoding.decode_with_bom_removal(bytes).0.into_owned()
}

fn exth_of(buf: &[u8], encoding: u32) -> Result<Exth, String> {
  if bytes_at(buf, 0, 4) != b"EXTH" {
    return Err("Invalid EXTH header".into());
  }
  let mut exth = Exth::default();
  let mut offset = 12;
  for _ in 0..uint(buf, 8, 4) {
    let kind = uint(buf, offset, 4);
    let length = uint(buf, offset + 4, 4) as usize;
    let data = bytes_at(buf, offset + 8, offset + length);
    if EXTH_UINT.contains(&kind) {
      exth.uints.insert(kind, uint(data, 0, data.len().min(4)));
    } else {
      let value = decode(decoder(encoding), data);
      let values = exth.strings.entry(kind).or_default();
      if !EXTH_MANY.contains(&kind) {
        values.clear();
      }
      values.push(value);
    }
    if length < 8 {
      break;
    }
    offset += length;
  }
  Ok(exth)
}

#[derive(Debug)]
struct Headers {
  compression: u32,
  num_text_records: u32,
  encryption: u32,
  encoding: u32,
  uid: u32,
  version: u32,
  title: Vec<u8>,
  language: Option<&'static str>,
  resource_start: u32,
  huffcdic: u32,
  num_huffcdic: u32,
  trailing_flags: u32,
  indx: u32,
  exth: Option<Exth>,
  /// of KF8: the records of the skeletons and the fragments
  skel: u32,
  frag: u32,
}

fn headers_of(buf: &[u8]) -> Result<Headers, String> {
  if bytes_at(buf, 16, 20) != b"MOBI" {
    return Err("Missing MOBI header".into());
  }
  let encoding = uint(buf, 28, 4);
  let (title_offset, title_length) =
    (uint(buf, 84, 4) as usize, uint(buf, 88, 4) as usize);
  let (region, language) = (uint(buf, 94, 1), uint(buf, 95, 1));
  let exth = if uint(buf, 128, 4) & 0x40 != 0 {
    Some(exth_of(
      bytes_at(buf, uint(buf, 20, 4) as usize + 16, buf.len()),
      encoding,
    )?)
  } else {
    None
  };
  Ok(Headers {
    compression: uint(buf, 0, 2),
    num_text_records: uint(buf, 8, 2),
    encryption: uint(buf, 12, 2),
    encoding,
    uid: uint(buf, 32, 4),
    version: uint(buf, 36, 4),
    title: bytes_at(buf, title_offset, title_offset + title_length).to_vec(),
    language: mobi_language(language, region),
    resource_start: uint(buf, 108, 4),
    huffcdic: uint(buf, 112, 4),
    num_huffcdic: uint(buf, 116, 4),
    trailing_flags: uint(buf, 240, 4),
    indx: uint(buf, 244, 4),
    exth,
    skel: uint(buf, 252, 4),
    frag: uint(buf, 248, 4),
  })
}

/// An entry of an INDX table: its name and tags.
struct IndexEntry {
  name: String,
  tags: HashMap<u32, Vec<u32>>,
}

impl IndexEntry {
  fn tag(&self, tag: u32, i: usize) -> Option<u32> {
    self.tags.get(&tag).and_then(|v| v.get(i)).copied()
  }
}

pub struct Mobi {
  data: Vec<u8>,
  offsets: Vec<(usize, usize)>,
  /// the first record of the book read: of the KF8 part of a combo file
  start: usize,
  headers: Headers,
  /// the first record of the resources, of the first header
  resource_start: usize,
  kf8: bool,
  huff: Option<Huff>,
}

impl Mobi {
  pub fn open(data: Vec<u8>) -> Result<Self, String> {
    let count = uint(&data, 76, 2) as usize;
    let starts: Vec<usize> = (0..count)
      .map(|i| uint(&data, 78 + i * 8, 4) as usize)
      .collect();
    let offsets = starts
      .iter()
      .enumerate()
      .map(|(i, s)| (*s, starts.get(i + 1).copied().unwrap_or(data.len())))
      .collect();
    let mut mobi = Self {
      data,
      offsets,
      start: 0,
      headers: empty_headers(),
      resource_start: 0,
      kf8: false,
      huff: None,
    };
    mobi.headers = headers_of(mobi.record(0)?)?;
    mobi.resource_start = mobi.headers.resource_start as usize;
    mobi.kf8 = mobi.headers.version >= 8;
    if !mobi.kf8 {
      let boundary = mobi
        .headers
        .exth
        .as_ref()
        .and_then(|e| e.uints.get(&121).copied())
        .filter(|b| *b < NONE);
      // a combo MOBI/KF8 file: its KF8 part
      if let Some(boundary) = boundary
        && let Ok(headers) = mobi.record(boundary as usize).and_then(headers_of)
      {
        mobi.headers = headers;
        mobi.start = boundary as usize;
        mobi.kf8 = true;
      }
    }
    match mobi.headers.compression {
      1 | 2 => {}
      17480 => {
        let huff = mobi.record_at(mobi.headers.huffcdic as usize)?;
        let cdics = (1..mobi.headers.num_huffcdic as usize)
          .map(|i| mobi.record_at(mobi.headers.huffcdic as usize + i))
          .collect::<Result<Vec<_>, _>>()?;
        mobi.huff = Some(Huff::new(huff, &cdics)?);
      }
      _ => return Err("Unknown compression type".into()),
    }
    Ok(mobi)
  }

  /// A record by its index in the file.
  fn record(&self, index: usize) -> Result<&[u8], String> {
    let (start, end) = *self
      .offsets
      .get(index)
      .ok_or("Record index out of bounds")?;
    Ok(bytes_at(&self.data, start, end))
  }

  /// A record of the book read (of its KF8 part in a combo file).
  fn record_at(&self, index: usize) -> Result<&[u8], String> {
    self.record(self.start + index)
  }

  fn text_record(&mut self, index: usize) -> Result<Vec<u8>, String> {
    let mut array = self.record_at(index + 1)?;
    let flags = self.headers.trailing_flags;
    for _ in 0..(flags >> 1).count_ones() {
      let length = var_len_from_end(array) as usize;
      array = if length == 0 {
        &array[..0]
      } else {
        &array[..array.len().saturating_sub(length)]
      };
    }
    if flags & 1 != 0 {
      let length = (array.last().copied().unwrap_or(0) & 3) as usize + 1;
      array = &array[..array.len().saturating_sub(length)];
    }
    let array = array.to_vec();
    Ok(match self.headers.compression {
      2 => decompress_palmdoc(&array),
      17480 => match self.huff.as_mut() {
        Some(huff) => huff.decompress(&array, 0),
        None => array,
      },
      _ => array,
    })
  }

  /// All the text, the records one after the other.
  fn raw_text(&mut self) -> Vec<u8> {
    let mut out = Vec::new();
    for i in 0..self.headers.num_text_records as usize {
      match self.text_record(i) {
        Ok(text) => out.extend_from_slice(&text),
        Err(_) => break,
      }
    }
    out
  }

  fn decode(&self, bytes: &[u8]) -> String {
    decode(decoder(self.headers.encoding), bytes)
  }

  fn index_data(
    &self,
    index: u32,
  ) -> Result<(Vec<IndexEntry>, HashMap<u32, String>), String> {
    let index = index as usize;
    let indx = self.record_at(index)?;
    if bytes_at(indx, 0, 4) != b"INDX" {
      return Err("Invalid INDX record".into());
    }
    let encoding = decoder(uint(indx, 28, 4));
    let num_records = uint(indx, 24, 4) as usize;
    let tagx = bytes_at(indx, uint(indx, 4, 4) as usize, indx.len());
    if bytes_at(tagx, 0, 4) != b"TAGX" {
      return Err("Invalid TAGX section".into());
    }
    let control_bytes = uint(tagx, 8, 4) as usize;
    let tag_table: Vec<[u8; 4]> =
      (0..(uint(tagx, 4, 4) as usize).saturating_sub(12) / 4)
        .map(|i| {
          let b = bytes_at(tagx, 12 + i * 4, 16 + i * 4);
          [b.first(), b.get(1), b.get(2), b.get(3)].map(|x| x.copied().unwrap_or(0))
        })
        .collect();

    let mut cncx = HashMap::new();
    for i in 0..uint(indx, 52, 4) as usize {
      let record = self.record_at(index + num_records + i + 1)?;
      let mut pos = 0;
      while pos < record.len() {
        let at = pos;
        let (value, length) = var_len(record, pos);
        if length == 0 {
          break;
        }
        pos += length;
        let text = decode(encoding, bytes_at(record, pos, pos + value as usize));
        cncx.insert((i as u32) * 0x10000 + at as u32, text);
        pos += value as usize;
      }
    }

    let mut table = Vec::new();
    for i in 0..num_records {
      let record = self.record_at(index + 1 + i)?;
      if bytes_at(record, 0, 4) != b"INDX" {
        return Err("Invalid INDX record".into());
      }
      let idxt = uint(record, 20, 4) as usize;
      for j in 0..uint(record, 24, 4) as usize {
        let offset = uint(record, idxt + 4 + 2 * j, 2) as usize;
        let length = uint(record, offset, 1) as usize;
        let name =
          String::from_utf8_lossy(bytes_at(record, offset + 1, offset + 1 + length))
            .into_owned();
        let start = offset + 1 + length;
        let mut control = 0;
        let mut pos = start + control_bytes;
        // tag, the count of values (or of their bytes), the values each
        let mut tags: Vec<(u32, Option<u32>, Option<u32>, u32)> = Vec::new();
        for [tag, values, mask, end] in &tag_table {
          if end & 1 != 0 {
            control += 1;
            continue;
          }
          let mask = *mask as u32;
          let value = uint(record, start + control, 1) & mask;
          if value == mask {
            if mask.count_ones() > 1 {
              let (v, l) = var_len(record, pos);
              tags.push((*tag as u32, None, Some(v), *values as u32));
              pos += l;
            } else {
              tags.push((*tag as u32, Some(1), None, *values as u32));
            }
          } else {
            let shift = if mask == 0 { 0 } else { mask.trailing_zeros() };
            tags.push((*tag as u32, Some(value >> shift), None, *values as u32));
          }
        }
        let mut map = HashMap::new();
        for (tag, count, value_bytes, per) in tags {
          let mut values = Vec::new();
          match count {
            Some(count) => {
              for _ in 0..count * per {
                let (v, l) = var_len(record, pos);
                values.push(v);
                pos += l;
              }
            }
            None => {
              let mut read = 0;
              while read < value_bytes.unwrap_or(0) as usize {
                let (v, l) = var_len(record, pos);
                if l == 0 {
                  break;
                }
                values.push(v);
                pos += l;
                read += l;
              }
            }
          }
          map.insert(tag, values);
        }
        table.push(IndexEntry { name, tags: map });
      }
    }
    Ok((table, cncx))
  }

  pub fn meta(&self) -> BookMeta {
    let h = &self.headers;
    let exth = h.exth.as_ref();
    let one = |kind| exth.and_then(|e| e.one(kind)).map(unescape_html);
    let non_empty =
      |s: Option<String>| s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let list = |kind, unescape: bool| -> Vec<String> {
      exth
        .and_then(|e| e.all(kind))
        .unwrap_or_default()
        .iter()
        .map(|s| {
          if unescape {
            unescape_html(s)
          } else {
            s.clone()
          }
        })
        .collect()
    };
    let title = exth
      .and_then(|e| e.one(503))
      .filter(|t| !t.is_empty())
      .map(str::to_string)
      .unwrap_or_else(|| self.decode(&h.title));
    let language: Vec<String> = match exth.and_then(|e| e.all(524)) {
      Some(langs) => langs.to_vec(),
      None => h.language.map(str::to_string).into_iter().collect(),
    };
    let language: Vec<String> = language
      .into_iter()
      .map(|l| l.trim().to_string())
      .filter(|l| !l.is_empty())
      .collect();
    let subjects: Vec<String> = list(105, true)
      .into_iter()
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .collect();
    BookMeta {
      title: unescape_html(&title),
      author: list(100, true)
        .into_iter()
        .filter(|a| !a.is_empty())
        .collect::<Vec<_>>()
        .join(", "),
      publisher: one(101).filter(|p| !p.is_empty()),
      published: non_empty(exth.and_then(|e| e.one(106)).map(str::to_string)),
      language: (!language.is_empty()).then_some(language),
      identifier: Some(h.uid.to_string()),
      subjects: (!subjects.is_empty()).then_some(subjects),
      description: non_empty(one(103)),
      ..Default::default()
    }
  }

  pub fn cover(&self) -> Option<Vec<u8>> {
    let exth = self.headers.exth.as_ref()?;
    let offset = [201, 202]
      .iter()
      .filter_map(|k| exth.uints.get(k))
      .find(|o| **o < NONE)?;
    self
      .record(self.resource_start + *offset as usize)
      .ok()
      .map(<[u8]>::to_vec)
  }

  pub fn fixed_layout(&self) -> bool {
    self.kf8 && self.headers.exth.as_ref().and_then(|e| e.one(122)) == Some("true")
  }

  pub fn sections(&mut self) -> Vec<Section> {
    // encrypted (DRM): no text to read
    if self.headers.encryption != 0 {
      return Vec::new();
    }
    if self.kf8 {
      self.kf8_sections().unwrap_or_default()
    } else {
      self.mobi6_sections()
    }
  }

  fn kf8_sections(&mut self) -> Result<Vec<Section>, String> {
    let skels: Vec<(u32, usize, usize)> = self
      .index_data(self.headers.skel)?
      .0
      .iter()
      .map(|e| {
        (
          e.tag(1, 0).unwrap_or(0),
          e.tag(6, 0).unwrap_or(0) as usize,
          e.tag(6, 1).unwrap_or(0) as usize,
        )
      })
      .collect();
    // the fragments: where they go, their index, offset and length
    let frags: Vec<(usize, u32, usize, usize)> = self
      .index_data(self.headers.frag)?
      .0
      .iter()
      .map(|e| {
        let digits: String = e
          .name
          .trim_start()
          .chars()
          .take_while(char::is_ascii_digit)
          .collect();
        (
          digits.parse().unwrap_or(0),
          e.tag(4, 0).unwrap_or(0),
          e.tag(6, 0).unwrap_or(0) as usize,
          e.tag(6, 1).unwrap_or(0) as usize,
        )
      })
      .collect();
    let mut sections = Vec::new();
    let mut frag_end = 0;
    for (num_frag, offset, length) in skels {
      let start = frag_end.min(frags.len());
      frag_end += num_frag as usize;
      sections.push((offset, length, &frags[start..frag_end.min(frags.len())]));
    }

    let toc = self.kf8_toc().unwrap_or_default();
    let fids: Vec<Vec<u32>> = sections
      .iter()
      .map(|(_, _, f)| f.iter().map(|f| f.1).collect())
      .collect();
    let labels = label_sections(&toc, sections.len(), |href| {
      let fid: u32 = href.parse().ok()?;
      fids.iter().position(|f| f.contains(&fid))
    });

    let raw = self.raw_text();
    Ok(
      sections
        .iter()
        .zip(labels)
        .enumerate()
        .map(|(i, ((offset, length, frags), label))| {
          let text = if frags.is_empty() {
            String::new()
          } else {
            let total = length + frags.iter().map(|f| f.3).sum::<usize>();
            let chunk = bytes_at(&raw, *offset, offset + total);
            let mut skeleton = bytes_at(chunk, 0, *length).to_vec();
            for (insert, _, frag_offset, frag_length) in frags.iter() {
              let at = insert.saturating_sub(*offset).min(skeleton.len());
              let from = length + frag_offset;
              let piece = bytes_at(chunk, from, from + frag_length);
              skeleton.splice(at..at, piece.iter().copied());
            }
            let page = self.decode(&skeleton);
            match parse_xml(&page).ok().filter(|r| !r.ns.is_empty()) {
              Some(root) => text_of(&root, false),
              None => text_of(&parse_html(&page), true),
            }
          };
          Section {
            cfi: index_cfi(i),
            label,
            text,
          }
        })
        .collect(),
    )
  }

  /// The table of contents of KF8, the href of each entry its fragment.
  fn kf8_toc(&self) -> Result<Vec<TocItem>, String> {
    if self.headers.indx == NONE {
      return Ok(Vec::new());
    }
    let (table, cncx) = self.index_data(self.headers.indx)?;
    struct Entry {
      label: String,
      fid: Option<u32>,
      level: Option<u32>,
      parent: Option<u32>,
      has_children: bool,
    }
    let entries: Vec<Entry> = table
      .iter()
      .map(|e| Entry {
        label: e
          .tags
          .get(&3)
          .filter(|v| v.len() == 1)
          .and_then(|v| cncx.get(&v[0]))
          .cloned()
          .unwrap_or_default(),
        fid: e.tag(6, 0),
        level: e.tag(4, 0),
        parent: e.tag(21, 0),
        has_children: e.tag(22, 0).is_some(),
      })
      .collect();
    // an entry without its place: no table of contents, as foliate
    if entries.iter().any(|e| e.fid.is_none()) {
      return Ok(Vec::new());
    }
    fn item(entries: &[Entry], i: usize, depth: usize) -> TocItem {
      let e = &entries[i];
      TocItem {
        label: unescape_html(&e.label),
        href: e.fid.unwrap_or_default().to_string(),
        subitems: if e.has_children && depth < 64 {
          (0..entries.len())
            .filter(|j| entries[*j].parent == Some(i as u32))
            .map(|j| item(entries, j, depth + 1))
            .collect()
        } else {
          Vec::new()
        },
      }
    }
    Ok(
      (0..entries.len())
        .filter(|i| entries[*i].level == Some(0))
        .map(|i| item(&entries, i, 0))
        .collect(),
    )
  }

  fn mobi6_sections(&mut self) -> Vec<Section> {
    static PAGEBREAK: LazyLock<BytesRegex> = LazyLock::new(|| {
      BytesRegex::new(r"(?i-u)<[\s\xa0]*(?:mbp:)?pagebreak[^>]*>").unwrap()
    });
    static PAGEBREAK_TEXT: LazyLock<Regex> =
      LazyLock::new(|| Regex::new(r"(?i)<\s*(?:mbp:)?pagebreak[^>]*>").unwrap());
    static SELF_CLOSING: LazyLock<Regex> =
      LazyLock::new(|| Regex::new(r"(?i)<(a|div|span|p)\s*/>").unwrap());
    let raw = self.raw_text();
    let mut starts = vec![0];
    starts.extend(PAGEBREAK.find_iter(&raw).map(|m| m.start()));
    let ends: Vec<usize> =
      starts.iter().skip(1).copied().chain([raw.len()]).collect();
    let pages: Vec<_> = starts
      .iter()
      .zip(&ends)
      .map(|(start, end)| {
        let text = self.decode(bytes_at(&raw, *start, *end));
        let text = PAGEBREAK_TEXT.replace_all(&text, "");
        parse_html(&SELF_CLOSING.replace_all(&text, "<$1></$1>"))
      })
      .collect();
    // a section by a filepos: the first that ends after it
    let index_of = |href: &str| {
      let pos: f64 = href.strip_prefix("filepos:")?.trim().parse().ok()?;
      ends.iter().position(|end| *end as f64 > pos)
    };
    let toc: Vec<TocItem> = (|| {
      let guide = pages.first()?;
      let toc_ref = guide.descendants().into_iter().find(|e| {
        e.name == "reference"
          && e
            .attr("type")
            .unwrap_or_default()
            .split_whitespace()
            .any(|t| t == "toc")
      })?;
      let page = &pages[index_of(&format!("filepos:{}", toc_ref.attr("filepos")?))?];
      Some(
        page
          .descendants()
          .into_iter()
          .filter(|e| e.name == "a")
          .filter_map(|a| {
            Some(TocItem {
              label: normalize_ws(&a.text()),
              href: format!("filepos:{}", a.attr("filepos")?),
              subitems: Vec::new(),
            })
          })
          .collect(),
      )
    })()
    .unwrap_or_default();
    let labels = label_sections(&toc, pages.len(), index_of);
    pages
      .iter()
      .zip(labels)
      .enumerate()
      .map(|(i, (page, label))| Section {
        cfi: index_cfi(i),
        label,
        text: text_of(page, true),
      })
      .collect()
  }
}

fn empty_headers() -> Headers {
  Headers {
    compression: 1,
    num_text_records: 0,
    encryption: 0,
    encoding: 65001,
    uid: 0,
    version: 0,
    title: Vec::new(),
    language: None,
    resource_start: 0,
    huffcdic: 0,
    num_huffcdic: 0,
    trailing_flags: 0,
    indx: NONE,
    exth: None,
    skel: NONE,
    frag: NONE,
  }
}

/// The language of the MOBI header, by its language and region codes.
fn mobi_language(language: u32, region: u32) -> Option<&'static str> {
  let langs: &[Option<&'static str>] = match language {
    1 => &[
      Some("ar"),
      Some("ar-SA"),
      Some("ar-IQ"),
      Some("ar-EG"),
      Some("ar-LY"),
      Some("ar-DZ"),
      Some("ar-MA"),
      Some("ar-TN"),
      Some("ar-OM"),
      Some("ar-YE"),
      Some("ar-SY"),
      Some("ar-JO"),
      Some("ar-LB"),
      Some("ar-KW"),
      Some("ar-AE"),
      Some("ar-BH"),
      Some("ar-QA"),
    ],
    2 => &[Some("bg")],
    3 => &[Some("ca")],
    4 => &[
      Some("zh"),
      Some("zh-TW"),
      Some("zh-CN"),
      Some("zh-HK"),
      Some("zh-SG"),
    ],
    5 => &[Some("cs")],
    6 => &[Some("da")],
    7 => &[
      Some("de"),
      Some("de-DE"),
      Some("de-CH"),
      Some("de-AT"),
      Some("de-LU"),
      Some("de-LI"),
    ],
    8 => &[Some("el")],
    9 => &[
      Some("en"),
      Some("en-US"),
      Some("en-GB"),
      Some("en-AU"),
      Some("en-CA"),
      Some("en-NZ"),
      Some("en-IE"),
      Some("en-ZA"),
      Some("en-JM"),
      None,
      Some("en-BZ"),
      Some("en-TT"),
      Some("en-ZW"),
      Some("en-PH"),
    ],
    10 => &[
      Some("es"),
      Some("es-ES"),
      Some("es-MX"),
      None,
      Some("es-GT"),
      Some("es-CR"),
      Some("es-PA"),
      Some("es-DO"),
      Some("es-VE"),
      Some("es-CO"),
      Some("es-PE"),
      Some("es-AR"),
      Some("es-EC"),
      Some("es-CL"),
      Some("es-UY"),
      Some("es-PY"),
      Some("es-BO"),
      Some("es-SV"),
      Some("es-HN"),
      Some("es-NI"),
      Some("es-PR"),
    ],
    11 => &[Some("fi")],
    12 => &[
      Some("fr"),
      Some("fr-FR"),
      Some("fr-BE"),
      Some("fr-CA"),
      Some("fr-CH"),
      Some("fr-LU"),
      Some("fr-MC"),
    ],
    13 => &[Some("he")],
    14 => &[Some("hu")],
    15 => &[Some("is")],
    16 => &[Some("it"), Some("it-IT"), Some("it-CH")],
    17 => &[Some("ja")],
    18 => &[Some("ko")],
    19 => &[Some("nl"), Some("nl-NL"), Some("nl-BE")],
    20 => &[Some("no"), Some("nb"), Some("nn")],
    21 => &[Some("pl")],
    22 => &[Some("pt"), Some("pt-BR"), Some("pt-PT")],
    23 => &[Some("rm")],
    24 => &[Some("ro")],
    25 => &[Some("ru")],
    26 => &[Some("hr"), None, Some("sr")],
    27 => &[Some("sk")],
    28 => &[Some("sq")],
    29 => &[Some("sv"), Some("sv-SE"), Some("sv-FI")],
    30 => &[Some("th")],
    31 => &[Some("tr")],
    32 => &[Some("ur")],
    33 => &[Some("id")],
    34 => &[Some("uk")],
    35 => &[Some("be")],
    36 => &[Some("sl")],
    37 => &[Some("et")],
    38 => &[Some("lv")],
    39 => &[Some("lt")],
    41 => &[Some("fa")],
    42 => &[Some("vi")],
    43 => &[Some("hy")],
    44 => &[Some("az")],
    45 => &[Some("eu")],
    46 => &[Some("hsb")],
    47 => &[Some("mk")],
    48 => &[Some("st")],
    49 => &[Some("ts")],
    50 => &[Some("tn")],
    52 => &[Some("xh")],
    53 => &[Some("zu")],
    54 => &[Some("af")],
    55 => &[Some("ka")],
    56 => &[Some("fo")],
    57 => &[Some("hi")],
    58 => &[Some("mt")],
    59 => &[Some("se")],
    62 => &[Some("ms")],
    63 => &[Some("kk")],
    65 => &[Some("sw")],
    67 => &[Some("uz"), None, Some("uz-UZ")],
    68 => &[Some("tt")],
    69 => &[Some("bn")],
    70 => &[Some("pa")],
    71 => &[Some("gu")],
    72 => &[Some("or")],
    73 => &[Some("ta")],
    74 => &[Some("te")],
    75 => &[Some("kn")],
    76 => &[Some("ml")],
    77 => &[Some("as")],
    78 => &[Some("mr")],
    79 => &[Some("sa")],
    82 => &[Some("cy"), Some("cy-GB")],
    83 => &[Some("gl"), Some("gl-ES")],
    87 => &[Some("kok")],
    97 => &[Some("ne")],
    98 => &[Some("fy")],
    _ => &[],
  };
  langs
    .get((region >> 2) as usize)
    .copied()
    .flatten()
    .or_else(|| langs.first().copied().flatten())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn decompresses_palmdoc() {
    // a literal, 3 copied, a space and a char, 3 from 5 back
    let data = [b'a', 3, b'x', b'y', b'z', 0xe2, 0x80, 0x28];
    assert_eq!(decompress_palmdoc(&data), b"axyz bxyz");
  }

  #[test]
  fn reads_variable_lengths() {
    assert_eq!(var_len(&[0x81], 0), (1, 1));
    assert_eq!(var_len(&[0x01, 0x82], 0), (130, 2));
    assert_eq!(var_len_from_end(&[0xff, 0x81, 0x02]), 130);
    assert_eq!(read32_bits(&[0x12, 0x34, 0x56, 0x78, 0x9a], 4), 0x2345_6789);
  }

  #[test]
  fn languages() {
    assert_eq!(mobi_language(4, 2 << 2), Some("zh-CN"));
    assert_eq!(mobi_language(9, 9 << 2), Some("en"));
    assert_eq!(mobi_language(99, 0), None);
  }
}
