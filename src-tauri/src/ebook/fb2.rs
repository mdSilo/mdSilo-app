//! FB2, as foliate-js reads it (packages/foliate-js/fb2.js): converted to
//! XHTML, a section for each part of the first body, one for each other body.

use super::tree::{El, Node, XHTML, normalize_ws, parse_xml, text_of};
use super::{BookMeta, Section, TocItem, index_cfi, label_sections, parse_float};
use base64::Engine;
use regex::Regex;
use std::sync::LazyLock;

const NS_XLINK: &str = "http://www.w3.org/1999/xlink";

/// What an FB2 element of a part is converted to, as the tables of fb2.js.
#[derive(Clone, Copy, PartialEq)]
enum Def {
  Root,
  Body,
  Section,
  Title,
  Style,
  Anchor,
  Table,
  Tr,
  Poem,
  Annotation,
  /// no element kept, only the text
  Text,
}

enum Rule {
  Image,
  Anchor,
  /// the element made, the definition of its children
  El(&'static str, Def),
}

fn rule(def: Def, name: &str) -> Option<Rule> {
  use Def::*;
  use Rule::El as E;
  let style = |name: &str| match name {
    "strong" => Some(E("strong", Style)),
    "emphasis" => Some(E("em", Style)),
    "style" => Some(E("span", Style)),
    "a" => Some(Rule::Anchor),
    "strikethrough" => Some(E("s", Style)),
    "sub" => Some(E("sub", Style)),
    "sup" => Some(E("sup", Style)),
    "code" => Some(E("code", Style)),
    "image" => Some(Rule::Image),
    _ => None,
  };
  let title = |name: &str| match name {
    "p" => Some(E("h1", Style)),
    "empty-line" => Some(E("br", Text)),
    _ => None,
  };
  match def {
    Root => (name == "body").then_some(E("body", Body)),
    Annotation => (name == "annotation").then_some(E("div", Section)),
    Anchor => (name == "a").then_some(E("a", Style)),
    Style => style(name),
    Title => title(name),
    Table => (name == "tr").then_some(E("tr", Tr)),
    Tr => match name {
      "th" => Some(E("th", Style)),
      "td" => Some(E("td", Style)),
      _ => None,
    },
    Poem => match name {
      "epigraph" => Some(E("blockquote", Section)),
      "subtitle" => Some(E("h2", Style)),
      "text-author" | "date" => Some(E("p", Style)),
      "stanza" => Some(E("div", Poem)),
      "v" => Some(E("div", Style)),
      _ => None,
    },
    Section => match name {
      "title" => Some(E("header", Title)),
      "epigraph" => Some(E("blockquote", Section)),
      "image" => Some(Rule::Image),
      "annotation" => Some(E("aside", Text)),
      "section" => Some(E("section", Section)),
      "p" => Some(E("p", Style)),
      "poem" => Some(E("blockquote", Poem)),
      "subtitle" => Some(E("h2", Style)),
      "cite" => Some(E("blockquote", Section)),
      "empty-line" => Some(E("br", Text)),
      "table" => Some(E("table", Table)),
      "text-author" => Some(E("p", Style)),
      _ => None,
    },
    Body => match name {
      "image" => Some(Rule::Image),
      "title" => Some(E("section", Title)),
      "epigraph" => Some(E("section", Section)),
      "section" => Some(E("section", Section)),
      _ => None,
    },
    Text => None,
  }
}

/// An element converted: of XHTML, its class the name of the FB2 element.
fn convert(node: &El, def: Def) -> Option<El> {
  let (name, child_def) = match rule(def, &node.name)? {
    Rule::Image => return Some(make(node, "img", Vec::new())),
    Rule::Anchor => return convert(node, Def::Anchor),
    Rule::El(name, child_def) => (name, child_def),
  };
  let children = node
    .children
    .iter()
    .filter_map(|c| match c {
      Node::Text(t) => Some(Node::Text(t.clone())),
      Node::El(e) => convert(e, child_def).map(Node::El),
    })
    .collect();
  Some(make(node, name, children))
}

fn make(node: &El, name: &str, children: Vec<Node>) -> El {
  let mut attrs = Vec::new();
  if let Some(id) = node.attr("id").filter(|id| !id.is_empty()) {
    attrs.push(attr("id", id));
  }
  attrs.push(attr("class", &node.name));
  El {
    ns: XHTML.into(),
    name: name.into(),
    attrs,
    children,
  }
}

fn attr(name: &str, value: &str) -> super::tree::Attr {
  super::tree::Attr {
    ns: String::new(),
    name: name.into(),
    qname: name.into(),
    value: value.into(),
  }
}

fn class_of(el: &El) -> &str {
  el.attr("class").unwrap_or_default()
}

/// The children of a converted element as XML, as `innerHTML`.
fn inner_html(el: &El) -> String {
  fn escape(s: &str, attr: bool) -> String {
    let mut out = String::new();
    for c in s.chars() {
      match c {
        '&' => out.push_str("&amp;"),
        '<' => out.push_str("&lt;"),
        '>' => out.push_str("&gt;"),
        '"' if attr => out.push_str("&quot;"),
        c => out.push(c),
      }
    }
    out
  }
  fn write(el: &El, out: &mut String) {
    out.push('<');
    out.push_str(&el.name);
    for a in &el.attrs {
      out.push_str(&format!(" {}=\"{}\"", a.qname, escape(&a.value, true)));
    }
    if el.children.is_empty() && matches!(el.name.as_str(), "br" | "img") {
      out.push_str("/>");
      return;
    }
    out.push('>');
    for c in &el.children {
      match c {
        Node::Text(t) => out.push_str(&escape(t, false)),
        Node::El(e) => write(e, out),
      }
    }
    out.push_str(&format!("</{}>", el.name));
  }
  let mut out = String::new();
  for c in &el.children {
    match c {
      Node::Text(t) => out.push_str(&escape(t, false)),
      Node::El(e) => write(e, &mut out),
    }
  }
  out
}

/// The elements of the name with an ancestor of another, in document order,
/// as the CSS selector `ancestor name`.
fn under<'a>(root: &'a El, ancestor: &str, name: &str) -> Vec<&'a El> {
  let mut out = Vec::new();
  fn walk<'a>(
    el: &'a El,
    inside: bool,
    ancestor: &str,
    name: &str,
    out: &mut Vec<&'a El>,
  ) {
    for e in el.elements() {
      if inside && e.name == name {
        out.push(e);
      }
      walk(e, inside || e.name == ancestor, ancestor, name, out);
    }
  }
  walk(root, root.name == ancestor, ancestor, name, &mut out);
  out
}

pub struct Fb2 {
  doc: El,
}

impl Fb2 {
  /// Parse an FB2 file: in UTF-8, or the encoding its declaration names.
  pub fn open(data: &[u8]) -> Result<Self, String> {
    static ENCODING: LazyLock<Regex> = LazyLock::new(|| {
      Regex::new(r#"^<\?xml\s+version\s*=\s*["']1.\d+"\s+encoding\s*=\s*["']([A-Za-z0-9._-]*)["']"#).unwrap()
    });
    let utf8 = String::from_utf8_lossy(data);
    let text = match ENCODING
      .captures(&utf8)
      .and_then(|c| encoding_rs::Encoding::for_label(c[1].as_bytes()))
    {
      Some(encoding) if encoding != encoding_rs::UTF_8 => {
        encoding.decode(data).0.into_owned()
      }
      _ => utf8.into_owned(),
    };
    let doc = parse_xml(&text)?;
    if !doc.descendants().iter().any(|e| e.name == "body") && doc.name != "body" {
      return Err("FB2 without a body".into());
    }
    Ok(Self { doc })
  }

  fn first(&self, ancestor: &str, name: &str) -> Option<&El> {
    under(&self.doc, ancestor, name).into_iter().next()
  }

  fn text_of_first(&self, ancestor: &str, name: &str) -> String {
    self
      .first(ancestor, name)
      .map(|e| normalize_ws(&e.text()))
      .unwrap_or_default()
  }

  pub fn meta(&self) -> BookMeta {
    let person = |el: &El| -> String {
      let text = |name: &str| {
        el.find(|e| e.name == name)
          .map(|e| normalize_ws(&e.text()))
          .unwrap_or_default()
      };
      let nick = text("nickname");
      if !nick.is_empty() {
        return nick;
      }
      [text("first-name"), text("middle-name"), text("last-name")]
        .into_iter()
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
    };
    let authors: Vec<String> = under(&self.doc, "title-info", "author")
      .into_iter()
      .map(person)
      .filter(|a| !a.is_empty())
      .collect();
    let series = self
      .doc
      .descendants()
      .into_iter()
      .filter(|e| e.name == "title-info")
      .flat_map(|t| t.children_named("sequence"))
      .map(|s| {
        (
          normalize_ws(s.attr("name").unwrap_or_default()),
          s.attr("number"),
        )
      })
      .find(|(name, _)| !name.is_empty());
    let date = self.first("title-info", "date").map(|d| {
      d.attr("value")
        .map(str::to_string)
        .unwrap_or_else(|| normalize_ws(&d.text()))
    });
    let description = self
      .first("title-info", "annotation")
      .and_then(|a| convert(a, Def::Annotation))
      .map(|a| inner_html(&a));
    let non_empty = |s: String| {
      let s = s.trim().to_string();
      (!s.is_empty()).then_some(s)
    };
    let subjects: Vec<String> = under(&self.doc, "title-info", "genre")
      .into_iter()
      .filter_map(|g| non_empty(normalize_ws(&g.text())))
      .collect();
    BookMeta {
      title: self.text_of_first("title-info", "book-title"),
      author: authors.join(", "),
      series: series.as_ref().map(|(name, _)| name.clone()),
      series_index: series
        .and_then(|(_, n)| n.filter(|n| !n.is_empty()))
        .and_then(parse_float),
      publisher: non_empty(self.text_of_first("publish-info", "publisher")),
      published: date.and_then(non_empty),
      language: non_empty(self.text_of_first("title-info", "lang")).map(|l| vec![l]),
      identifier: non_empty(self.text_of_first("document-info", "id")),
      subjects: (!subjects.is_empty()).then_some(subjects),
      description: description.and_then(non_empty),
      ..Default::default()
    }
  }

  /// The image of the cover page, of a binary in the book.
  pub fn cover(&self) -> Option<Vec<u8>> {
    let image = self.first("coverpage", "image")?;
    let href = image.attr_ns(NS_XLINK, "href")?;
    let id = href.split('#').nth(1).filter(|id| !id.is_empty())?;
    let binary = self
      .doc
      .descendants()
      .into_iter()
      .find(|e| e.name == "binary" && e.attr("id") == Some(id))?;
    let data: String = binary
      .text()
      .chars()
      .filter(|c| !c.is_whitespace())
      .collect();
    base64::engine::general_purpose::STANDARD.decode(data).ok()
  }

  pub fn sections(&self) -> Vec<Section> {
    let bodies: Vec<El> = self
      .doc
      .descendants()
      .into_iter()
      .filter(|e| e.name == "body")
      .filter_map(|b| convert(b, Def::Root))
      .collect();
    let Some((first, rest)) = bodies.split_first() else {
      return Vec::new();
    };
    // the parts of the first body, then the other bodies whole
    let parts: Vec<&El> = first.elements().chain(rest.iter()).collect();
    let toc: Vec<TocItem> = parts
      .iter()
      .enumerate()
      .map(|(i, el)| {
        let heading =
          el.find(|e| matches!(class_of(e), "title" | "subtitle") || e.name == "p");
        let label = match heading {
          Some(h) => normalize_ws(&h.text()),
          None if class_of(el) == "title" => normalize_ws(&el.text()),
          None => String::new(),
        };
        // the titles of its sections, of the first body only
        let subitems = if i < first.elements().count() {
          el.children_named("section")
            .flat_map(|s| s.elements().filter(|e| class_of(e) == "title"))
            .enumerate()
            .map(|(j, t)| TocItem {
              label: normalize_ws(&t.text()),
              href: format!("{i}#{j}"),
              subitems: Vec::new(),
            })
            .collect()
        } else {
          Vec::new()
        };
        TocItem {
          label,
          href: i.to_string(),
          subitems,
        }
      })
      .collect();
    let labels = label_sections(&toc, parts.len(), |href| {
      href.split('#').next()?.parse().ok()
    });
    parts
      .iter()
      .zip(labels)
      .enumerate()
      .map(|(i, (el, label))| {
        let page = El {
          ns: XHTML.into(),
          name: "html".into(),
          attrs: Vec::new(),
          children: vec![Node::El(El {
            ns: XHTML.into(),
            name: "body".into(),
            attrs: Vec::new(),
            children: vec![Node::El((*el).clone())],
          })],
        };
        Section {
          cfi: index_cfi(i),
          label,
          text: text_of(&page, false),
        }
      })
      .collect()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const BOOK: &str = r##"<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><genre>sf</genre><author><first-name>Ann</first-name><last-name>Lee</last-name></author>
<book-title> A  Book </book-title><annotation><p>About &amp; more</p></annotation><date value="2020-01-01">2020</date>
<coverpage><image l:href="#c.png"/></coverpage><lang>en</lang><sequence name="Saga" number="3"/></title-info>
<document-info><id>abc</id></document-info><publish-info><publisher>P</publisher></publish-info></description>
<body><title><p>The Book</p></title>
<section><title><p>One</p></title><p>First<strong>ly</strong></p><unknown>dropped</unknown><section><title><p>Inner</p></title><p>x</p></section></section>
<section><p>no title</p></section></body>
<body name="notes"><section id="n1"><p>A note</p></section></body>
<binary id="c.png" content-type="image/png">aGVs
bG8=</binary></FictionBook>"##;

  #[test]
  fn reads_fb2() {
    let book = Fb2::open(BOOK.as_bytes()).unwrap();
    let meta = book.meta();
    assert_eq!(meta.title, "A Book");
    assert_eq!(meta.author, "Ann Lee");
    assert_eq!(meta.series.as_deref(), Some("Saga"));
    assert_eq!(meta.series_index, Some(3.0));
    assert_eq!(meta.published.as_deref(), Some("2020-01-01"));
    assert_eq!(meta.identifier.as_deref(), Some("abc"));
    assert_eq!(meta.publisher.as_deref(), Some("P"));
    assert_eq!(
      meta.description.as_deref(),
      Some(r#"<p class="p">About &amp; more</p>"#)
    );
    assert_eq!(book.cover(), Some(b"hello".to_vec()));

    let sections = book.sections();
    let got: Vec<(&str, &str, &str)> = sections
      .iter()
      .map(|s| (s.cfi.as_str(), s.label.as_str(), s.text.as_str()))
      .collect();
    assert_eq!(
      got,
      [
        ("epubcfi(/6/2)", "The Book", "The Book"),
        ("epubcfi(/6/4)", "One", "One Firstly Inner x"),
        ("epubcfi(/6/6)", "no title", "no title"),
        ("epubcfi(/6/8)", "A note", "A note"),
      ]
    );
  }
}
