//! What a note links to and contains, from its markdown: the same as the
//! frontend finds (src/utils/mdlink.ts, src/lib/linkIndex.ts), so either can
//! tell, e.g. the index for the notes not loaded.

use fancy_regex::Regex as FancyRegex;
use percent_encoding::percent_decode_str;
use regex::Regex;
use std::sync::LazyLock;

/// [label](href) or [label](href "title"), `!` prefix for images:
/// 1-bang, 2-label, 3-destination
static MD_LINK: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(
    r#"(!?)\[((?:\\.|[^\\\[\]\n])*)\]\(\s*(<[^<>\n]*>|(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*)\)"#,
  )
  .unwrap()
});
/// [[target]] or [[target|alias]]
static WIKI_LINK: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"\[\[([^\[|\]\n]+)(?:\|([^\[|\]\n]+))?\]\]").unwrap());
static ESCAPED_CHAR: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"\\([!-/:-@\[-`{-~])").unwrap());
/// fenced code blocks: ``` or ~~~
static FENCE: LazyLock<FancyRegex> = LazyLock::new(|| {
  FancyRegex::new(r"(?m)^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|\z)").unwrap()
});
/// inline code: a backtick run closed by a run of the same length
static INLINE_CODE: LazyLock<FancyRegex> =
  LazyLock::new(|| FancyRegex::new(r"(`+)(?!`)(?:[^\n]|\n(?![ \t]*\n))*?\1(?!`)").unwrap());
/// #tag#, the trailing space a lookahead so adjacent tags share it
static HASHTAG: LazyLock<FancyRegex> = LazyLock::new(|| FancyRegex::new(r"\s#([^#\n]+)#(?=\s)").unwrap());
/// [#12](issue:12)
static ISSUE_LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(issue:(\d+)\)").unwrap());
/// #todo# #doing# #done# tags or checkboxes: maybe tasks
static MAYBE_TASKS: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)#(todo|doing|done)#|\[[ xX_-]\]").unwrap());

/// What a note links to and contains.
#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Parsed {
  /// the titles of the notes linked, in order, as many times as linked
  pub links: Vec<String>,
  pub tags: Vec<String>,
  /// the issues linked, [#12](issue:12)
  pub issues: Vec<u32>,
  /// it may have tasks: to look for them in the note
  pub has_tasks: bool,
}

/// Blank out the matches, keeping the byte offsets and the line breaks.
fn blank(text: &mut String, re: &FancyRegex) {
  let ranges: Vec<(usize, usize)> = re
    .find_iter(text)
    .filter_map(|m| m.ok())
    .map(|m| (m.start(), m.end()))
    .collect();
  if ranges.is_empty() {
    return;
  }
  let mut out = String::with_capacity(text.len());
  let mut last = 0;
  for (start, end) in ranges {
    out.push_str(&text[last..start]);
    for c in text[start..end].chars() {
      if c == '\n' {
        out.push('\n');
      } else {
        out.extend(std::iter::repeat_n(' ', c.len_utf8()));
      }
    }
    last = end;
  }
  out.push_str(&text[last..]);
  *text = out;
}

/// The content with its code blanked out, so the links in code are ignored.
pub fn mask_code(content: &str) -> String {
  let mut masked = content.to_string();
  if !content.contains('`') && !content.contains("~~~") {
    return masked;
  }
  blank(&mut masked, &FENCE);
  blank(&mut masked, &INLINE_CODE);
  masked
}

/// decodeURIComponent, or the text as is if it is not valid
fn safe_decode(text: &str) -> String {
  match percent_decode_str(text).decode_utf8() {
    Ok(decoded) => decoded.into_owned(),
    Err(_) => text.to_string(),
  }
}

/// The note title of a raw link destination or wiki link target.
pub fn raw_href_to_title(raw: &str) -> String {
  let mut href = raw.trim();
  if href.starts_with('<') && href.ends_with('>') && href.len() >= 2 {
    href = &href[1..href.len() - 1];
  }
  let unescaped = ESCAPED_CHAR.replace_all(href, "$1");
  safe_decode(unescaped.trim()).trim().to_string()
}

/// A link to a note: not an URL, nor a link of the app (issue:, book:).
pub fn is_note_href(href: &str) -> bool {
  if href.is_empty() {
    return false;
  }
  let lower = href.to_ascii_lowercase();
  !(lower.starts_with("http:") || lower.starts_with("https:")
    || lower.starts_with("issue:") || lower.starts_with("book:"))
}

/// The titles of the notes the content links to, in order.
pub fn note_links(content: &str) -> Vec<String> {
  if !content.contains('[') {
    return vec![];
  }
  let masked = mask_code(content);
  let bytes = masked.as_bytes();
  let escaped = |index: usize| index > 0 && bytes[index - 1] == b'\\';
  let mut links: Vec<(usize, String)> = Vec::new();
  for caps in WIKI_LINK.captures_iter(&masked) {
    let m = caps.get(0).unwrap();
    if escaped(m.start()) {
      continue;
    }
    let title = raw_href_to_title(&caps[1]);
    if is_note_href(&title) {
      links.push((m.start(), title));
    }
  }
  for caps in MD_LINK.captures_iter(&masked) {
    let m = caps.get(0).unwrap();
    let index = m.start();
    if !caps[1].is_empty() || escaped(index) {
      continue;
    }
    // `[x]` of `[[x]](y)`, a wiki link
    if index > 0 && bytes[index - 1] == b'[' && masked[index - 1..].starts_with("[[") {
      continue;
    }
    let title = raw_href_to_title(&caps[3]);
    if is_note_href(&title) {
      links.push((index, title));
    }
  }
  links.sort_by_key(|(index, _)| *index);
  links.into_iter().map(|(_, title)| title).collect()
}

pub fn tags(content: &str) -> Vec<String> {
  HASHTAG
    .captures_iter(content)
    .filter_map(|c| c.ok())
    .filter_map(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
    .filter(|tag| !tag.is_empty() && !tag.contains('#'))
    .collect()
}

pub fn issue_links(content: &str) -> Vec<u32> {
  let mut nums: Vec<u32> = ISSUE_LINK
    .captures_iter(content)
    .filter_map(|c| c[1].parse().ok())
    .collect();
  nums.sort_unstable();
  nums.dedup();
  nums
}

pub fn parse(content: &str) -> Parsed {
  Parsed {
    links: note_links(content),
    tags: tags(content),
    issues: issue_links(content),
    has_tasks: MAYBE_TASKS.is_match(content),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn links_to_notes() {
    let content = "[[A]] and [[B|alias]], [c](C%20d) [img](!x) ![pic](p.png) [w](https://x.org) \
      [#1](issue:1) [q](book:0123#x) \\[[not]] [e](<E f>) [[[x]](y)";
    assert_eq!(note_links(content), ["A", "B", "C d", "!x", "E f", "x"]);
  }

  #[test]
  fn not_in_code() {
    let content = "`[[a]]` [[b]]\n```\n[[c]]\n```\n``x [[d]] x`` [[e]]\n~~~\n[[f]]";
    assert_eq!(note_links(content), ["b", "e"]);
    // offsets kept with multi-byte text
    let masked = mask_code("中`文`字");
    assert_eq!(masked.len(), "中`文`字".len());
    assert!(masked.starts_with('中') && masked.ends_with('字'));
  }

  #[test]
  fn titles_decoded_and_unescaped() {
    assert_eq!(raw_href_to_title(" a\\_b "), "a_b");
    assert_eq!(raw_href_to_title("100%"), "100%");
    assert_eq!(raw_href_to_title("%E4%BD%A0%E5%A5%BD"), "你好");
    assert_eq!(raw_href_to_title("%E4%BD"), "%E4%BD");
    assert!(!is_note_href("Issue:3"));
    assert!(is_note_href("bookish"));
  }

  #[test]
  fn tags_issues_tasks() {
    let content = "x #one# #two words# #a#b# end\n[i](issue:12) [j](issue:3) [k](issue:12)";
    let parsed = parse(content);
    assert_eq!(parsed.tags, ["one", "two words"]);
    assert_eq!(parsed.issues, [3, 12]);
    assert!(!parsed.has_tasks);
    assert!(parse("- [ ] buy milk").has_tasks);
    assert!(parse("call #TODO# now").has_tasks);
  }
}
