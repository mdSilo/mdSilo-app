//! EPUB, as foliate-js reads it (packages/foliate-js/epub.js): the sections
//! by the spine, their labels by the nav or NCX, the metadata of the OPF.

use super::tree::{El, XHTML, normalize_ws, parse_html, parse_xml, text_of};
use super::{BookMeta, Section, TocItem, label_sections, parse_float};
use regex::Regex;
use std::collections::HashMap;
use std::io::{Read, Seek};
use std::sync::LazyLock;
use zip::ZipArchive;

const NS_DC: &str = "http://purl.org/dc/elements/1.1/";
const NS_OPF: &str = "http://www.idpf.org/2007/opf";
const NS_EPUB: &str = "http://www.idpf.org/2007/ops";
const MARC_RELATORS: &str = "http://id.loc.gov/vocabulary/relators";
const RENDITION_LAYOUT: &str = "http://www.idpf.org/vocab/rendition/#layout";

const PREFIX: &[(&str, &str)] = &[
  ("a11y", "http://www.idpf.org/epub/vocab/package/a11y/#"),
  ("dcterms", "http://purl.org/dc/terms/"),
  ("marc", "http://id.loc.gov/vocabulary/"),
  ("media", "http://www.idpf.org/epub/vocab/overlays/#"),
  (
    "onix",
    "http://www.editeur.org/ONIX/book/codelists/current.html#",
  ),
  ("rendition", "http://www.idpf.org/vocab/rendition/#"),
  ("schema", "http://schema.org/"),
  ("xsd", "http://www.w3.org/2001/XMLSchema#"),
  ("msv", "http://www.idpf.org/epub/vocab/structure/magazine/#"),
  (
    "prism",
    "http://www.prismstandard.org/specifications/3.0/PRISM_CV_Spec_3.0.htm#",
  ),
];

/// The files of a zip, by name; in another case if only one has it.
pub struct Zip<R> {
  archive: ZipArchive<R>,
  /// the names in the order of the central directory
  pub names: Vec<String>,
  lower: HashMap<String, Option<usize>>,
}

impl<R: Read + Seek> Zip<R> {
  pub fn new(reader: R) -> Result<Self, String> {
    let mut archive = ZipArchive::new(reader).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    let mut lower: HashMap<String, Option<usize>> = HashMap::new();
    for i in 0..archive.len() {
      let name = archive
        .by_index_raw(i)
        .ok()
        .and_then(|f| f.name().ok().map(|n| n.to_string()))
        .unwrap_or_default();
      lower
        .entry(name.to_lowercase())
        .and_modify(|v| *v = None)
        .or_insert(Some(i));
      names.push(name);
    }
    Ok(Self {
      archive,
      names,
      lower,
    })
  }

  fn index_of(&self, name: &str) -> Option<usize> {
    self
      .names
      .iter()
      .position(|n| n == name)
      .or_else(|| self.lower.get(&name.to_lowercase()).copied().flatten())
  }

  pub fn bytes(&mut self, name: &str) -> Option<Vec<u8>> {
    let i = self.index_of(name)?;
    let mut file = self.archive.by_index(i).ok()?;
    if file.is_dir() {
      return None;
    }
    let mut out = Vec::new();
    file.read_to_end(&mut out).ok()?;
    Some(out)
  }

  pub fn text(&mut self, name: &str) -> Option<String> {
    self.bytes(name).map(|b| {
      String::from_utf8_lossy(&b)
        .trim_start_matches('\u{feff}')
        .to_string()
    })
  }

  fn xml(&mut self, name: &str) -> Result<Option<El>, String> {
    match self.text(name) {
      Some(s) => parse_xml(&s).map(Some),
      None => Ok(None),
    }
  }
}

#[derive(Debug, Clone)]
struct Item {
  id: String,
  href: String,
  media_type: String,
  properties: Vec<String>,
}

pub struct Epub<R> {
  zip: Zip<R>,
  opf: El,
  /// the manifest item and the CFI of each section
  sections: Vec<(Item, String)>,
  nav_path: Option<String>,
  ncx_path: Option<String>,
  cover: Option<Item>,
}

/// The decoded path of a zip entry, as foliate's decodeURIPath: `/` and `#`
/// left encoded; as it is if malformed.
fn decode_uri_path(path: &str) -> String {
  static SEP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("(?i)%(2f|23)").unwrap());
  let escaped = SEP.replace_all(path, "%25$1");
  let bytes = escaped.as_bytes();
  // a `%` not followed by two hex digits: decodeURIComponent throws
  for (i, b) in bytes.iter().enumerate() {
    if *b == b'%'
      && !(i + 2 < bytes.len()
        && bytes[i + 1].is_ascii_hexdigit()
        && bytes[i + 2].is_ascii_hexdigit())
    {
      return path.to_string();
    }
  }
  percent_encoding::percent_decode_str(&escaped)
    .decode_utf8()
    .map(|s| s.into_owned())
    .unwrap_or_else(|_| path.to_string())
}

/// A URL relative to a file of the book, as foliate's resolveURL.
pub fn resolve_url(url: &str, relative_to: &str) -> String {
  const ROOT: &str = "https://invalid.invalid/";
  let resolved = url::Url::parse(ROOT)
    .and_then(|root| root.join(relative_to))
    .and_then(|base| base.join(url));
  match resolved {
    Ok(mut u) => {
      u.set_query(None);
      decode_uri_path(u.as_str().strip_prefix(ROOT).unwrap_or(u.as_str()))
    }
    Err(_) => url.to_string(),
  }
}

fn escape_cfi(s: &str) -> String {
  let mut out = String::new();
  for c in s.chars() {
    if "^[](),;=".contains(c) {
      out.push('^');
    }
    out.push(c);
  }
  out
}

impl<R: Read + Seek> Epub<R> {
  pub fn open(reader: R) -> Result<Self, String> {
    let mut zip = Zip::new(reader)?;
    let container = zip
      .xml("META-INF/container.xml")?
      .ok_or("Failed to load container file")?;
    let opf_path = container
      .descendants()
      .into_iter()
      .filter(|e| e.name == "rootfile")
      .find(|e| e.attr("media-type") == Some("application/oebps-package+xml"))
      .and_then(|e| e.attr("full-path"))
      .ok_or("No package document defined in container")?
      .to_string();
    let opf = zip
      .xml(&opf_path)?
      .ok_or("Failed to load package document")?;
    let resolve = |href: &str| resolve_url(href, &opf_path);

    let manifest: Vec<Item> = opf
      .child("manifest")
      .map(|m| {
        m.children_named("item")
          .map(|e| Item {
            id: e.attr("id").unwrap_or_default().to_string(),
            href: resolve(e.attr("href").unwrap_or_default()),
            media_type: e.attr("media-type").unwrap_or_default().to_string(),
            properties: e
              .attr("properties")
              .map(|p| p.split_whitespace().map(str::to_string).collect())
              .unwrap_or_default(),
          })
          .collect()
      })
      .unwrap_or_default();
    let by_id = |id: Option<&str>| {
      id.and_then(|id| manifest.iter().find(|i| i.id == id).cloned())
    };
    let by_property = |p: &str| {
      manifest
        .iter()
        .find(|i| i.properties.iter().any(|x| x == p))
    };

    // the CFI of an itemref: its place in the spine, the spine's in the package
    let spine_index = opf
      .elements()
      .position(|e| e.name == "spine")
      .ok_or("No spine")?;
    let spine = opf.child("spine").ok_or("No spine")?;
    let mut sections = Vec::new();
    for (i, itemref) in spine.elements().enumerate() {
      if itemref.name != "itemref" {
        continue;
      }
      let id = itemref
        .attr("id")
        .map(|id| format!("[{}]", escape_cfi(id)))
        .unwrap_or_default();
      let cfi = format!("epubcfi(/{}/{}{id})", (spine_index + 1) * 2, (i + 1) * 2);
      if let Some(item) = by_id(itemref.attr("idref")) {
        sections.push((item, cfi));
      }
    }

    let nav_path = by_property("nav").map(|i| i.href.clone());
    let ncx_path = by_id(spine.attr("toc"))
      .or_else(|| {
        manifest
          .iter()
          .find(|i| i.media_type == "application/x-dtbncx+xml")
          .cloned()
      })
      .map(|i| i.href);

    let guide_cover = opf.child("guide").and_then(|g| {
      g.children_named("reference")
        .find(|r| {
          r.attr("type")
            .unwrap_or_default()
            .split_whitespace()
            .any(|t| t == "cover")
        })
        .map(|r| resolve(r.attr("href").unwrap_or_default()))
    });
    let is_image = |i: &&Item| i.media_type.starts_with("image");
    let cover = by_property("cover-image")
      .cloned()
      .or_else(|| {
        let meta = opf
          .descendants()
          .into_iter()
          .find(|e| e.name == "meta" && e.attr("name") == Some("cover"));
        by_id(meta.and_then(|m| m.attr("content")))
      })
      .or_else(|| {
        manifest
          .iter()
          .find(|i| i.id == "cover" && is_image(i))
          .cloned()
      })
      .or_else(|| {
        manifest
          .iter()
          .find(|i| i.href.contains("cover") && is_image(i))
          .cloned()
      })
      .or_else(|| {
        guide_cover
          .and_then(|href| manifest.iter().find(|i| i.href == href).cloned())
      })
      .or_else(|| manifest.iter().find(is_image).cloned());

    Ok(Self {
      zip,
      opf,
      sections,
      nav_path,
      ncx_path,
      cover,
    })
  }

  /// The bytes of the cover image; a file named as a cover if none declared.
  pub fn cover(&mut self) -> Option<Vec<u8>> {
    if let Some(cover) = &self.cover {
      let href = cover.href.clone();
      return self.zip.bytes(&href);
    }
    static UNDECLARED: LazyLock<Regex> = LazyLock::new(|| {
      Regex::new(r"(?i)(?:cover|couv)\.(?:jpe?g|png|gif|webp|svg)$").unwrap()
    });
    let name = self
      .zip
      .names
      .iter()
      .find(|n| UNDECLARED.is_match(n))?
      .clone();
    self.zip.bytes(&name)
  }

  /// Of fixed layout: its pages not text to index.
  pub fn fixed_layout(&mut self) -> bool {
    let prefixes = prefixes(&self.opf);
    let declared = self
      .opf
      .child("metadata")
      .map(|m| {
        m.elements().any(|e| {
          e.ns == NS_OPF
            && e.name == "meta"
            && e.attr("name").is_none()
            && e.attr("refines").is_none()
            && property_url(e.attr("property"), &prefixes).as_deref()
              == Some(RENDITION_LAYOUT)
            && normalize_ws(&e.text()) == "pre-paginated"
        })
      })
      .unwrap_or(false);
    let display_options = [
      "META-INF/com.apple.ibooks.display-options.xml",
      "META-INF/com.kobobooks.display-options.xml",
    ]
    .into_iter()
    .find_map(|name| self.zip.xml(name).ok().flatten());
    declared
      || display_options.is_some_and(|doc| {
        doc
          .find(|e| e.name == "option" && e.attr("name") == Some("fixed-layout"))
          .is_some_and(|e| normalize_ws(&e.text()) == "true")
      })
  }

  fn toc(&mut self) -> Vec<TocItem> {
    let navigable = |items: &[TocItem]| {
      fn any(items: &[TocItem]) -> bool {
        items.iter().any(|i| !i.href.is_empty() || any(&i.subitems))
      }
      any(items)
    };
    let mut toc = Vec::new();
    if let Some(path) = self.nav_path.clone()
      && let Ok(Some(doc)) = self.zip.xml(&path)
    {
      toc = parse_nav(&doc, &path);
    }
    if !navigable(&toc)
      && let Some(path) = self.ncx_path.clone()
      && let Ok(Some(doc)) = self.zip.xml(&path)
    {
      toc = parse_ncx(&doc, &path);
    }
    toc
  }

  /// The sections with their text, empty for the ones that have none.
  pub fn sections(&mut self) -> Vec<Section> {
    let toc = self.toc();
    let ids: HashMap<String, usize> = self
      .sections
      .iter()
      .enumerate()
      .map(|(i, (item, _))| (item.href.clone(), i))
      .collect();
    let labels = label_sections(&toc, self.sections.len(), |href| {
      ids.get(href.split('#').next().unwrap_or_default()).copied()
    });
    let sections = self.sections.clone();
    sections
      .into_iter()
      .zip(labels)
      .map(|((item, cfi), label)| Section {
        cfi,
        label,
        text: self
          .zip
          .text(&item.href)
          .map(|s| content_text(&s, &item.media_type))
          .unwrap_or_default(),
      })
      .collect()
  }

  pub fn meta(&self) -> BookMeta {
    metadata(&self.opf)
  }

  #[cfg(test)]
  pub fn cover_href(&self) -> Option<String> {
    self.cover.as_ref().map(|c| c.href.clone())
  }
}

/// The text of a content document, as foliate parses it: XHTML as XML, its
/// void elements closed if it is not well-formed, else as HTML.
fn content_text(s: &str, media_type: &str) -> String {
  match media_type {
    "application/xhtml+xml" => {
      // not well-formed, or not in a namespace
      let xml = |s: &str| parse_xml(s).ok().filter(|root| !root.ns.is_empty());
      if let Some(root) = xml(s) {
        return text_of(&root, false);
      }
      let repaired = close_void_elements(s);
      if repaired != s
        && let Some(root) = xml(&repaired)
      {
        return text_of(&root, false);
      }
      text_of(&parse_html(s), true)
    }
    "text/html" => text_of(&parse_html(s), true),
    // SVG and other XML: of the root
    t if t.ends_with("xml") => {
      parse_xml(s).map(|r| text_of(&r, false)).unwrap_or_default()
    }
    _ => String::new(),
  }
}

fn close_void_elements(s: &str) -> String {
  static VOID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<(meta|link|br|img|hr|input|col|area|base|embed|param|source|track|wbr)((?:[\s/](?:[^<>"']|"[^"]*"|'[^']*')*)?)>"#).unwrap()
  });
  VOID
    .replace_all(s, |c: &regex::Captures| {
      let attrs = &c[2];
      if attrs.trim_end().ends_with('/') {
        c[0].to_string()
      } else {
        format!("<{}{attrs}/>", &c[1])
      }
    })
    .into_owned()
}

fn parse_nav(doc: &El, path: &str) -> Vec<TocItem> {
  fn ol(el: Option<&El>, path: &str) -> Vec<TocItem> {
    let Some(el) = el else { return Vec::new() };
    el.children_named("li")
      .map(|li| {
        let a = li.child("a").or_else(|| li.child("span"));
        let label = a
          .map(|a| normalize_ws(&a.text()))
          .filter(|l| !l.is_empty())
          .or_else(|| a.and_then(|a| a.attr("title")).map(str::to_string))
          .unwrap_or_default();
        TocItem {
          label,
          href: a
            .and_then(|a| a.attr("href"))
            .filter(|h| !h.is_empty())
            .map(|h| resolve_url(h, path))
            .unwrap_or_default(),
          subitems: ol(li.child("ol"), path),
        }
      })
      .collect()
  }
  doc
    .descendants()
    .into_iter()
    .filter(|e| e.name == "nav" && e.ns == XHTML)
    .find(|nav| {
      nav
        .attr_ns(NS_EPUB, "type")
        .unwrap_or_default()
        .split_whitespace()
        .any(|t| t == "toc")
    })
    .map(|nav| ol(nav.child("ol"), path))
    .unwrap_or_default()
}

fn parse_ncx(doc: &El, path: &str) -> Vec<TocItem> {
  fn points(el: &El, path: &str) -> Vec<TocItem> {
    el.children_named("navPoint")
      .map(|p| TocItem {
        label: p
          .child("navLabel")
          .map(|l| normalize_ws(&l.text()))
          .unwrap_or_default(),
        href: p
          .child("content")
          .and_then(|c| c.attr("src"))
          .filter(|h| !h.is_empty())
          .map(|h| resolve_url(h, path))
          .unwrap_or_default(),
        subitems: points(p, path),
      })
      .collect()
  }
  doc
    .child("navMap")
    .map(|m| points(m, path))
    .unwrap_or_default()
}

fn prefixes(opf: &El) -> HashMap<String, String> {
  static PREFIX_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(.+): +(.+)[ \t\r\n]*").unwrap());
  let mut map: HashMap<String, String> = PREFIX
    .iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect();
  let value = opf
    .attr_ns(NS_EPUB, "prefix")
    .filter(|v| !v.is_empty())
    .or_else(|| opf.attr("prefix"));
  if let Some(value) = value {
    for c in PREFIX_ATTR.captures_iter(value) {
      map.insert(c[1].to_string(), c[2].to_string());
    }
  }
  map
}

/// The URL of a property, as foliate's getPropertyURL: none if not prefixed
/// by a known prefix.
fn property_url(
  value: Option<&str>,
  prefixes: &HashMap<String, String>,
) -> Option<String> {
  let value = value.filter(|v| !v.is_empty())?;
  let mut parts = value.split(':');
  let a = parts.next().unwrap_or_default();
  let (prefix, reference) = match parts.next() {
    Some(b) if !b.is_empty() => (Some(a), b),
    _ => (None, a),
  };
  prefix
    .and_then(|p| prefixes.get(p))
    .map(|base| format!("{base}{reference}"))
}

/// An element of the metadata, as foliate parses them.
struct Parsed<'a> {
  el: &'a El,
  property: Option<String>,
  scheme: Option<String>,
  value: String,
  /// the attributes in the OPF namespace, by local name
  attrs: HashMap<String, String>,
}

/// The metadata the library keeps, as bookMetaOf of
/// src/reader/library/library.ts makes it of foliate's.
pub fn metadata(opf: &El) -> BookMeta {
  let Some(metadata) = opf.child("metadata") else {
    return BookMeta::default();
  };
  let prefixes = prefixes(opf);
  fn parse_el<'a>(el: &'a El, prefixes: &HashMap<String, String>) -> Parsed<'a> {
    let property = el.attr("property");
    let scheme = el.attr("scheme");
    Parsed {
      el,
      property: property_url(property, prefixes).or(property.map(str::to_string)),
      scheme: property_url(scheme, prefixes).or(scheme.map(str::to_string)),
      value: normalize_ws(&el.text()),
      attrs: el
        .attrs
        .iter()
        .filter(|a| a.ns == NS_OPF)
        .map(|a| (a.name.clone(), a.value.clone()))
        .collect(),
    }
  }
  let parse = |el| parse_el(el, &prefixes);
  let metas: Vec<&El> = metadata
    .elements()
    .filter(|e| e.ns == NS_OPF && e.name == "meta" && e.attr("name").is_none())
    .collect();
  let legacy: HashMap<&str, &str> = metadata
    .elements()
    .filter(|e| e.ns == NS_OPF && e.name == "meta")
    .filter_map(|e| Some((e.attr("name")?, e.attr("content").unwrap_or_default())))
    .collect();
  // the meta refining an element, or the package if None
  let props = |el: Option<&El>| -> Vec<Parsed> {
    let key = el.map(|e| format!("#{}", e.attr("id").unwrap_or("null")));
    metas
      .iter()
      .filter(|m| m.attr("refines").map(str::to_string) == key)
      .map(|m| parse(m))
      .collect()
  };
  let prop = |x: &Parsed, p: &str| -> Option<String> {
    props(Some(x.el))
      .into_iter()
      .find(|y| y.property.as_deref() == Some(p))
      .map(|y| y.value)
  };
  let dc = |name: &str| -> Vec<Parsed> {
    metadata
      .elements()
      .filter(|e| e.ns == NS_DC && e.name == name)
      .map(parse)
      .collect()
  };

  let titles = dc("title");
  let main = titles
    .iter()
    .find(|t| prop(t, "title-type").as_deref() == Some("main"))
    .or(titles.first());
  let subtitle = titles
    .iter()
    .find(|t| prop(t, "title-type").as_deref() == Some("subtitle"))
    .map(|t| t.value.clone());

  // the creators and contributors by their roles: the authors, the
  // publishers if none is given
  let publishers = dc("publisher");
  let mut authors: Vec<String> = Vec::new();
  let mut role_publishers: Vec<String> = Vec::new();
  for (x, default) in dc("creator")
    .iter()
    .map(|x| (x, "author"))
    .chain(dc("contributor").iter().map(|x| (x, "contributor")))
    .collect::<Vec<_>>()
  {
    let roles: Vec<Option<String>> = {
      let refined: Vec<Parsed> = props(Some(x.el))
        .into_iter()
        .filter(|y| y.property.as_deref() == Some("role"))
        .collect();
      if refined.is_empty() {
        vec![x.attrs.get("role").cloned()]
      } else {
        refined
          .into_iter()
          .filter(|y| y.scheme.as_deref() == Some(MARC_RELATORS))
          .map(|y| Some(y.value))
          .collect()
      }
    };
    let mut keys: Vec<&str> = roles
      .iter()
      .map(|r| match r.as_deref() {
        Some("art") => "artist",
        Some("aut") => "author",
        Some("clr") => "colorist",
        Some("edt") => "editor",
        Some("ill") => "illustrator",
        Some("nrt") => "narrator",
        Some("trl") => "translator",
        Some("pbl") => "publisher",
        _ => default,
      })
      .collect();
    keys.dedup();
    if keys.is_empty() {
      keys.push(default);
    }
    if keys.contains(&"author") {
      authors.push(x.value.clone());
    }
    if keys.contains(&"publisher") && publishers.is_empty() {
      role_publishers.push(x.value.clone());
    }
  }
  let join = |names: &[String]| -> String {
    names
      .iter()
      .filter(|n| !n.is_empty())
      .cloned()
      .collect::<Vec<_>>()
      .join(", ")
  };
  let publisher = match publishers.first() {
    Some(p) => p.value.clone(),
    None => join(&role_publishers),
  };

  let dates = dc("date");
  let published = dates
    .iter()
    .find(|d| d.attrs.get("event").map(String::as_str) == Some("publication"))
    .or(dates.first())
    .map(|d| d.value.clone());

  let collections = props(None)
    .into_iter()
    .filter(|p| p.property.as_deref() == Some("belongs-to-collection"))
    .collect::<Vec<_>>();
  let series = collections
    .iter()
    .find(|c| prop(c, "collection-type").as_deref() == Some("series"));
  let (series, series_index) = match series {
    Some(s) => (
      Some(s.value.clone()),
      prop(s, "group-position").and_then(|p| parse_float(&p)),
    ),
    None => match legacy.get("calibre:series") {
      Some(name) if !name.is_empty() => (
        Some(name.to_string()),
        legacy
          .get("calibre:series_index")
          .and_then(|i| parse_float(i)),
      ),
      _ => (None, None),
    },
  };

  let unique = opf.attr("unique-identifier");
  let identifier = unique
    .and_then(|id| opf.find(|e| e.attr("id") == Some(id)))
    .or_else(|| opf.find(|e| e.ns == NS_DC && e.name == "identifier"))
    .map(|e| normalize_ws(&e.text()))
    .unwrap_or_default();
  static URN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("(?i)^urn:(isbn|uuid|doi):").unwrap());

  let non_empty = |s: String| {
    let s = s.trim().to_string();
    (!s.is_empty()).then_some(s)
  };
  let list = |xs: Vec<Parsed>| {
    let xs: Vec<String> =
      xs.into_iter().filter_map(|x| non_empty(x.value)).collect();
    (!xs.is_empty()).then_some(xs)
  };
  BookMeta {
    title: main.map(|t| t.value.clone()).unwrap_or_default(),
    author: join(&authors),
    subtitle: subtitle.and_then(non_empty),
    series: series.and_then(non_empty),
    series_index,
    publisher: non_empty(publisher),
    published: published.and_then(non_empty),
    language: list(dc("language")),
    // trimmed before the prefix is removed, as bookMetaOf
    identifier: Some(URN.replace(identifier.trim(), "").into_owned())
      .filter(|i| !i.is_empty()),
    subjects: list(dc("subject")),
    description: dc("description")
      .into_iter()
      .next()
      .and_then(|d| non_empty(d.value)),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn resolves_urls() {
    assert_eq!(
      resolve_url("Text/a%20b.xhtml", "OEBPS/content.opf"),
      "OEBPS/Text/a b.xhtml"
    );
    assert_eq!(
      resolve_url("../x.xhtml#p1", "OEBPS/Text/nav.xhtml"),
      "OEBPS/x.xhtml#p1"
    );
    assert_eq!(resolve_url("a%26b.html?q=1", "content.opf"), "a&b.html");
    assert_eq!(resolve_url("a%2Fb.html", "content.opf"), "a%2Fb.html");
    assert_eq!(resolve_url("a%zz.html", "content.opf"), "a%zz.html");
  }

  #[test]
  fn reads_the_metadata() {
    let opf = parse_xml(
      r##"<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" prefix="calibre: https://calibre-ebook.com">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:identifier id="uid">urn:isbn:123</dc:identifier>
        <dc:title id="t1">Main</dc:title>
        <dc:title id="t2">Sub</dc:title>
        <meta refines="#t2" property="title-type">subtitle</meta>
        <dc:creator id="c1">  Ann   A </dc:creator>
        <meta refines="#c1" property="role" scheme="marc:relators">aut</meta>
        <dc:creator id="c2">Ed</dc:creator>
        <meta refines="#c2" property="role" scheme="marc:relators">edt</meta>
        <dc:creator opf:role="pbl">Pub House</dc:creator>
        <dc:contributor opf:role="aut">Bob</dc:contributor>
        <dc:language>en</dc:language>
        <dc:date opf:event="modification">2020</dc:date>
        <dc:date opf:event="publication">2019</dc:date>
        <dc:subject>A</dc:subject><dc:subject> </dc:subject>
        <meta name="calibre:series" content="Saga"/>
        <meta name="calibre:series_index" content="2.5"/>
      </metadata></package>"##,
    )
    .unwrap();
    let meta = metadata(&opf);
    assert_eq!(meta.title, "Main");
    assert_eq!(meta.subtitle.as_deref(), Some("Sub"));
    assert_eq!(meta.author, "Ann A, Bob");
    assert_eq!(meta.publisher.as_deref(), Some("Pub House"));
    assert_eq!(meta.published.as_deref(), Some("2019"));
    assert_eq!(meta.identifier.as_deref(), Some("123"));
    assert_eq!(meta.language, Some(vec!["en".to_string()]));
    assert_eq!(meta.subjects, Some(vec!["A".to_string()]));
    assert_eq!(meta.series.as_deref(), Some("Saga"));
    assert_eq!(meta.series_index, Some(2.5));
  }

  #[test]
  fn closes_void_elements() {
    assert_eq!(
      close_void_elements(r#"<meta charset="utf-8"><br/><img src="a>b"><p>"#),
      r#"<meta charset="utf-8"/><br/><img src="a>b"/><p>"#
    );
  }
}
