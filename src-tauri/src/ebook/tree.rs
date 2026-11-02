//! A small tree of an XML or HTML document, for what the books need of them:
//! names, attributes and text; and the text of a page as the reader indexes it.

use quick_xml::escape::resolve_html5_entity;
use quick_xml::events::Event;
use quick_xml::name::ResolveResult;
use quick_xml::{NsReader, XmlVersion};

pub const XHTML: &str = "http://www.w3.org/1999/xhtml";

#[derive(Debug, Clone)]
pub enum Node {
  El(El),
  Text(String),
}

#[derive(Debug, Clone, Default)]
pub struct Attr {
  pub ns: String,
  /// the local name
  pub name: String,
  /// the name as written, e.g. `xml:lang`
  pub qname: String,
  pub value: String,
}

#[derive(Debug, Clone, Default)]
pub struct El {
  /// the namespace, empty if none
  pub ns: String,
  /// the local name
  pub name: String,
  pub attrs: Vec<Attr>,
  pub children: Vec<Node>,
}

impl El {
  /// The attribute by its name as written, as `getAttribute`.
  pub fn attr(&self, qname: &str) -> Option<&str> {
    self
      .attrs
      .iter()
      .find(|a| a.qname == qname)
      .map(|a| a.value.as_str())
  }

  pub fn attr_ns(&self, ns: &str, name: &str) -> Option<&str> {
    self
      .attrs
      .iter()
      .find(|a| a.ns == ns && a.name == name)
      .map(|a| a.value.as_str())
  }

  pub fn elements(&self) -> impl Iterator<Item = &El> {
    self.children.iter().filter_map(|n| match n {
      Node::El(e) => Some(e),
      Node::Text(_) => None,
    })
  }

  /// The first child element of the name.
  pub fn child(&self, name: &str) -> Option<&El> {
    self.elements().find(|e| e.name == name)
  }

  pub fn children_named<'a>(
    &'a self,
    name: &'a str,
  ) -> impl Iterator<Item = &'a El> {
    self.elements().filter(move |e| e.name == name)
  }

  /// The elements under this one, in document order.
  pub fn descendants(&self) -> Vec<&El> {
    let mut out = Vec::new();
    fn walk<'a>(el: &'a El, out: &mut Vec<&'a El>) {
      for e in el.elements() {
        out.push(e);
        walk(e, out);
      }
    }
    walk(self, &mut out);
    out
  }

  pub fn find(&self, f: impl Fn(&El) -> bool) -> Option<&El> {
    self.descendants().into_iter().find(|e| f(e))
  }

  /// All the text in it, as `textContent`.
  pub fn text(&self) -> String {
    let mut out = String::new();
    fn walk(el: &El, out: &mut String) {
      for n in &el.children {
        match n {
          Node::El(e) => walk(e, out),
          Node::Text(t) => out.push_str(t),
        }
      }
    }
    walk(self, &mut out);
    out
  }
}

/// ASCII whitespace stripped and collapsed, as foliate's normalizeWhitespace.
pub fn normalize_ws(s: &str) -> String {
  s.split(['\t', '\n', '\x0c', '\r', ' '])
    .filter(|w| !w.is_empty())
    .collect::<Vec<_>>()
    .join(" ")
}

/// The whitespace of `\s` in JavaScript.
pub fn is_js_space(c: char) -> bool {
  matches!(
    c,
    '\t' | '\n' | '\x0b' | '\x0c' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
      ..='\u{200a}'
        | '\u{2028}'
        | '\u{2029}'
        | '\u{202f}'
        | '\u{205f}'
        | '\u{3000}'
        | '\u{feff}'
  )
}

fn ns_of(r: ResolveResult) -> String {
  match r {
    ResolveResult::Bound(ns) => ns.as_ref().to_string(),
    _ => String::new(),
  }
}

fn push_text(children: &mut Vec<Node>, text: &str) {
  if let Some(Node::Text(t)) = children.last_mut() {
    t.push_str(text);
  } else {
    children.push(Node::Text(text.to_string()));
  }
}

/// The root element of an XML document. Lenient: the named entities of HTML
/// known, the end tags not checked, the elements left open closed.
pub fn parse_xml(s: &str) -> Result<El, String> {
  let mut reader = NsReader::from_str(s.strip_prefix('\u{feff}').unwrap_or(s));
  let config = reader.config_mut();
  config.check_end_names = false;
  config.allow_unmatched_ends = true;
  let version = XmlVersion::Implicit1_0;
  let entity = |name: &str| resolve_html5_entity(name);
  // the elements open, the document at the bottom
  let mut stack: Vec<El> = vec![El::default()];
  loop {
    let (ns, event) = reader.read_resolved_event().map_err(|e| e.to_string())?;
    let ns = ns_of(ns);
    match event {
      Event::Start(ref e) | Event::Empty(ref e) => {
        let mut el = El {
          ns,
          name: e.local_name().as_ref().to_string(),
          ..Default::default()
        };
        for attr in e.attributes().with_checks(false) {
          let attr = attr.map_err(|e| e.to_string())?;
          let (ans, local) = reader.resolver().resolve_attribute(attr.key);
          let value = attr
            .normalized_value_with(version, 16, entity)
            .map_err(|e| e.to_string())?;
          el.attrs.push(Attr {
            ns: ns_of(ans),
            name: local.as_ref().to_string(),
            qname: attr.key.as_ref().to_string(),
            value: value.into(),
          });
        }
        if matches!(event, Event::Start(_)) {
          stack.push(el);
        } else if let Some(parent) = stack.last_mut() {
          parent.children.push(Node::El(el));
        }
      }
      Event::End(_) => {
        if stack.len() > 1 {
          let el = stack.pop().unwrap_or_default();
          if let Some(parent) = stack.last_mut() {
            parent.children.push(Node::El(el));
          }
        }
      }
      Event::Text(t) => {
        if let Some(el) = stack.last_mut() {
          push_text(&mut el.children, &t.xml_content(version));
        }
      }
      Event::CData(t) => {
        if let Some(el) = stack.last_mut() {
          push_text(&mut el.children, &t.xml_content(version));
        }
      }
      Event::GeneralRef(r) => {
        let text = match r.resolve_char_ref() {
          Ok(Some(c)) => c.to_string(),
          Ok(None) => {
            let name = r.as_ref().to_string();
            entity(&name)
              .map(str::to_string)
              .ok_or_else(|| format!("unknown entity &{name};"))?
          }
          Err(e) => return Err(e.to_string()),
        };
        if let Some(el) = stack.last_mut() {
          push_text(&mut el.children, &text);
        }
      }
      Event::Eof => break,
      _ => {}
    }
  }
  while stack.len() > 1 {
    let el = stack.pop().unwrap_or_default();
    if let Some(parent) = stack.last_mut() {
      parent.children.push(Node::El(el));
    }
  }
  stack
    .pop()
    .and_then(|doc| {
      doc.children.into_iter().find_map(|n| match n {
        Node::El(e) => Some(e),
        Node::Text(_) => None,
      })
    })
    .ok_or_else(|| "no root element".into())
}

/// The `<html>` element of an HTML document, as a browser parses it.
pub fn parse_html(s: &str) -> El {
  let doc = dom_query::Document::from(s);
  fn convert(node: &dom_query::NodeRef) -> El {
    let mut el = El {
      ns: String::new(),
      name: node.node_name().map(|n| n.to_string()).unwrap_or_default(),
      attrs: node
        .attrs()
        .iter()
        .map(|a| Attr {
          ns: String::new(),
          name: a.name.local.to_string(),
          qname: match &a.name.prefix {
            Some(p) => format!("{p}:{}", a.name.local),
            None => a.name.local.to_string(),
          },
          value: a.value.to_string(),
        })
        .collect(),
      children: Vec::new(),
    };
    for child in node.children_it(false) {
      if child.is_element() {
        el.children.push(Node::El(convert(&child)));
      } else if child.is_text() {
        push_text(&mut el.children, &child.text());
      }
    }
    el
  }
  doc
    .root()
    .children_it(false)
    .find(|n| n.is_element())
    .map(|n| convert(&n))
    .unwrap_or_default()
}

/// The text of HTML within a textarea, as foliate's unescapeHTML: its
/// entities decoded.
pub fn unescape_html(s: &str) -> String {
  if !s.contains('&') {
    return s.to_string();
  }
  let html = parse_html(&format!("<textarea>{s}</textarea>"));
  html
    .find(|e| e.name == "textarea")
    .map(El::text)
    .unwrap_or_default()
}

const BLOCKS: &[&str] = &[
  "p",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "blockquote",
  "pre",
  "li",
  "ul",
  "ol",
  "dl",
  "dt",
  "dd",
  "table",
  "tr",
  "td",
  "th",
  "figure",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

/// The most of the text of a section the search keeps, in UTF-16 units as
/// MAX_SECTION_TEXT of src/reader/bookIndex.ts.
pub const MAX_SECTION_TEXT: usize = 200_000;

/// The text of a page, the blocks apart: no words run together. As textOf of
/// src/reader/bookIndex.ts: of the body (of an XHTML or HTML root), else of
/// the root.
pub fn text_of(root: &El, html: bool) -> String {
  let is_html_root = root.name == "html" && (html || root.ns == XHTML);
  let body = if is_html_root {
    root
      .elements()
      .find(|e| e.name == "body" && (html || e.ns == XHTML))
      .unwrap_or(root)
  } else {
    root
  };
  let mut out = String::new();
  let mut last: Option<usize> = None;
  fn walk(el: &El, block: usize, out: &mut String, last: &mut Option<usize>) {
    for n in &el.children {
      match n {
        Node::Text(t) => {
          if !out.is_empty() && *last != Some(block) {
            out.push(' ');
          }
          out.push_str(t);
          *last = Some(block);
        }
        Node::El(e) => {
          let b = if BLOCKS.contains(&e.name.as_str()) {
            e as *const El as usize
          } else {
            block
          };
          walk(e, b, out, last);
        }
      }
    }
  }
  walk(body, body as *const El as usize, &mut out, &mut last);
  let collapsed = out
    .split(is_js_space)
    .filter(|w| !w.is_empty())
    .collect::<Vec<_>>()
    .join(" ");
  truncate_utf16(collapsed, MAX_SECTION_TEXT)
}

fn truncate_utf16(s: String, max: usize) -> String {
  let mut units = 0;
  for (i, c) in s.char_indices() {
    units += c.len_utf16();
    if units > max {
      return s[..i].to_string();
    }
  }
  s
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_xml_leniently() {
    let root = parse_xml(
      r#"<?xml version="1.0"?><a xmlns="urn:x" xmlns:b="urn:b" b:c="1&amp;2"><b:d>x&nbsp;&#65;<![CDATA[<y>]]></b:d><e/></a>"#,
    )
    .unwrap();
    assert_eq!(root.name, "a");
    assert_eq!(root.ns, "urn:x");
    assert_eq!(root.attr("b:c"), Some("1&2"));
    assert_eq!(root.attr_ns("urn:b", "c"), Some("1&2"));
    let d = root.child("d").unwrap();
    assert_eq!(d.ns, "urn:b");
    assert_eq!(d.text(), "x\u{a0}A<y>");
    assert!(root.child("e").is_some());
    // an element left open
    assert_eq!(parse_xml("<a><b>x").unwrap().text(), "x");
  }

  #[test]
  fn the_text_of_a_page() {
    let page = parse_xml(&format!(
      r#"<html xmlns="{XHTML}"><head><title>T</title></head><body>
      <h1>One</h1><p>a<b>b</b></p><p>c</p>d<span>e</span></body></html>"#
    ))
    .unwrap();
    // the blocks apart, the inline elements not
    assert_eq!(text_of(&page, false), "One ab c de");
    // not XHTML: of the root
    let other =
      parse_xml("<html><head><title>T</title></head><body>x</body></html>").unwrap();
    assert_eq!(text_of(&other, false), "Tx");
    let html = parse_html("<p>a&amp;b<div>c</div>");
    assert_eq!(text_of(&html, true), "a&b c");
    assert_eq!(truncate_utf16("a😀b".into(), 3), "a😀");
  }

  #[test]
  fn unescapes_html() {
    assert_eq!(
      unescape_html("a &amp; b &lt;i&gt; &#20013;"),
      "a & b <i> 中"
    );
    assert_eq!(unescape_html("<b>x</b>"), "<b>x</b>");
  }
}
