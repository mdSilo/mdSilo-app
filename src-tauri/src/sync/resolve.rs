//! What to do with a file changed on both sides that git could not merge,
//! whatever the git library: nothing is lost, the sync goes on.
//!
//! - deleted on one side, changed on the other: the changed one is kept.
//! - the data of the app, `.mdsilo/**.json`: a three-way merge of the JSON
//!   (objects by key, lists of records by id); a value changed on both sides
//!   keeps this device's.
//! - a `.gitignore`: the lines of both.
//! - other files: the remote version in the file, this device's beside it as
//!   `Foo (conflict <stamp>).md`, to reconcile by hand. Other data files of
//!   the app (`.mdsilo/`) just take the remote version.

use serde_json::{Map, Value};

/// A file changed on both sides; the content of each side, None if absent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conflict {
  /// relative to the workspace, with `/`
  pub path: String,
  pub base: Option<Vec<u8>>,
  pub ours: Option<Vec<u8>>,
  pub theirs: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Resolved {
  /// the files to write (None: to delete), relative to the workspace
  pub writes: Vec<(String, Option<Vec<u8>>)>,
  /// where this device's version was kept, if beside the file
  pub copy: Option<String>,
}

const DATA_DIR: &str = ".mdsilo/";

/// Resolve a conflict; `stamp` names the copy, e.g. `2026-10-29 1530`.
/// `exists` says if a path is taken, for the name of the copy.
pub fn resolve(
  conflict: &Conflict,
  stamp: &str,
  exists: &dyn Fn(&str) -> bool,
) -> Resolved {
  let path = conflict.path.clone();
  let write = |data: Vec<u8>| Resolved {
    writes: vec![(path.clone(), Some(data))],
    copy: None,
  };
  let (ours, theirs) = match (&conflict.ours, &conflict.theirs) {
    (None, None) => {
      return Resolved {
        writes: vec![(path, None)],
        copy: None,
      };
    }
    (Some(ours), None) => return write(ours.clone()),
    (None, Some(theirs)) => return write(theirs.clone()),
    (Some(ours), Some(theirs)) => (ours, theirs),
  };
  if ours == theirs {
    return write(ours.clone());
  }
  let in_data = path.starts_with(DATA_DIR);
  let merged = (in_data && path.ends_with(".json"))
    .then(|| merge_json_bytes(conflict.base.as_deref(), ours, theirs));
  if let Some(Some(merged)) = merged {
    return write(merged);
  }
  if path == ".gitignore" || path.ends_with("/.gitignore") {
    return write(union_lines(ours, theirs));
  }
  if in_data {
    return write(theirs.clone());
  }
  let copy = copy_path(&path, stamp, exists);
  Resolved {
    writes: vec![
      (path, Some(theirs.clone())),
      (copy.clone(), Some(ours.clone())),
    ],
    copy: Some(copy),
  }
}

/// `writing/Foo.md` -> `writing/Foo (conflict <stamp>).md`, a free name.
pub fn copy_path(path: &str, stamp: &str, exists: &dyn Fn(&str) -> bool) -> String {
  let (dir, name) = path.rsplit_once('/').map_or(("", path), |(d, n)| (d, n));
  // the last extension only: `Foo.epub.md` -> `Foo.epub (conflict).md`
  let (stem, ext) = match name.rfind('.') {
    Some(i) if i > 0 => (&name[..i], &name[i..]),
    _ => (name, ""),
  };
  let prefix = if dir.is_empty() {
    String::new()
  } else {
    format!("{dir}/")
  };
  let mut n = 1;
  loop {
    let suffix = if n == 1 {
      String::new()
    } else {
      format!(" {n}")
    };
    let candidate = format!("{prefix}{stem} (conflict {stamp}{suffix}){ext}");
    if !exists(&candidate) {
      return candidate;
    }
    n += 1;
  }
}

fn union_lines(ours: &[u8], theirs: &[u8]) -> Vec<u8> {
  let theirs_text = String::from_utf8_lossy(theirs);
  let ours_text = String::from_utf8_lossy(ours);
  let mut lines: Vec<&str> = theirs_text.lines().collect();
  for line in ours_text.lines() {
    if line.trim().is_empty() || !lines.contains(&line) {
      lines.push(line);
    }
  }
  let mut text = lines.join("\n");
  text.push('\n');
  text.into_bytes()
}

fn merge_json_bytes(
  base: Option<&[u8]>,
  ours: &[u8],
  theirs: &[u8],
) -> Option<Vec<u8>> {
  let ours: Value = serde_json::from_slice(ours).ok()?;
  let theirs: Value = serde_json::from_slice(theirs).ok()?;
  let base: Option<Value> = base.and_then(|b| serde_json::from_slice(b).ok());
  let merged = merge_json(base.as_ref(), &ours, &theirs);
  // as the app writes them: 2 spaces, a newline at the end
  let mut text = serde_json::to_string_pretty(&merged).ok()?;
  text.push('\n');
  Some(text.into_bytes())
}

/// A three-way merge of JSON values; without a base, both sides added.
pub fn merge_json(base: Option<&Value>, ours: &Value, theirs: &Value) -> Value {
  if ours == theirs || base == Some(theirs) {
    return ours.clone();
  }
  if base == Some(ours) {
    return theirs.clone();
  }
  match (ours, theirs) {
    (Value::Object(o), Value::Object(t)) => {
      let base = base.and_then(Value::as_object);
      Value::Object(merge_objects(base, o, t))
    }
    (Value::Array(o), Value::Array(t)) => {
      let base = base.and_then(Value::as_array);
      Value::Array(merge_arrays(base, o, t))
    }
    // changed on both sides: this device's
    _ => ours.clone(),
  }
}

fn merge_objects(
  base: Option<&Map<String, Value>>,
  ours: &Map<String, Value>,
  theirs: &Map<String, Value>,
) -> Map<String, Value> {
  let base_of = |k: &str| base.and_then(|b| b.get(k));
  let mut merged = Map::new();
  for (k, o) in ours {
    match (theirs.get(k), base_of(k)) {
      (Some(t), b) => {
        merged.insert(k.clone(), merge_json(b, o, t));
      }
      // removed there, unchanged here
      (None, Some(b)) if b == o => {}
      // new here, or changed here and removed there: kept
      (None, _) => {
        merged.insert(k.clone(), o.clone());
      }
    }
  }
  for (k, t) in theirs {
    if ours.contains_key(k) {
      continue;
    }
    match base_of(k) {
      Some(b) if b == t => {} // removed here
      _ => {
        merged.insert(k.clone(), t.clone());
      }
    }
  }
  merged
}

/// The field naming the records of a list, if they all have one.
fn record_key(items: &[&Value]) -> Option<&'static str> {
  ["id", "number", "url", "link", "hash"]
    .into_iter()
    .find(|key| {
      !items.is_empty()
        && items.iter().all(|item| {
          item
            .get(key)
            .is_some_and(|v| v.is_string() || v.is_number())
        })
    })
}

/// Lists: records merged by their key, other items as a set; this device's
/// order, the new items from the other side after.
fn merge_arrays(
  base: Option<&Vec<Value>>,
  ours: &[Value],
  theirs: &[Value],
) -> Vec<Value> {
  let empty = Vec::new();
  let base = base.unwrap_or(&empty);
  let all: Vec<&Value> = base.iter().chain(ours).chain(theirs).collect();
  let key_name = record_key(&all);
  let key = |v: &Value| -> String {
    match key_name {
      Some(name) => v.get(name).map(|k| k.to_string()).unwrap_or_default(),
      None => v.to_string(),
    }
  };
  let find = |list: &[Value], k: &str| list.iter().find(|v| key(v) == k).cloned();
  let mut merged = Vec::new();
  let mut seen = std::collections::HashSet::new();
  for o in ours {
    let k = key(o);
    if !seen.insert(k.clone()) {
      continue;
    }
    let b = find(base, &k);
    match find(theirs, &k) {
      Some(t) => merged.push(if key_name.is_some() {
        merge_json(b.as_ref(), o, &t)
      } else {
        o.clone()
      }),
      None if b.as_ref() == Some(o) => {} // removed there
      None => merged.push(o.clone()),
    }
  }
  for t in theirs {
    let k = key(t);
    if !seen.insert(k.clone()) {
      continue;
    }
    match find(base, &k) {
      Some(b) if &b == t => {} // removed here
      _ => merged.push(t.clone()),
    }
  }
  merged
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  const STAMP: &str = "2026-10-29 1530";

  fn conflict(
    path: &str,
    base: Option<&str>,
    ours: Option<&str>,
    theirs: Option<&str>,
  ) -> Conflict {
    let bytes = |s: Option<&str>| s.map(|s| s.as_bytes().to_vec());
    Conflict {
      path: path.into(),
      base: bytes(base),
      ours: bytes(ours),
      theirs: bytes(theirs),
    }
  }

  fn text(data: &Option<Vec<u8>>) -> &str {
    std::str::from_utf8(data.as_deref().unwrap()).unwrap()
  }

  #[test]
  fn a_note_changed_on_both_sides_keeps_both() {
    let c = conflict("writing/Foo.md", Some("a"), Some("mine"), Some("theirs"));
    let r = resolve(&c, STAMP, &|_| false);
    assert_eq!(
      r.copy.as_deref(),
      Some("writing/Foo (conflict 2026-10-29 1530).md")
    );
    assert_eq!(r.writes[0].0, "writing/Foo.md");
    assert_eq!(text(&r.writes[0].1), "theirs");
    assert_eq!(r.writes[1].0, "writing/Foo (conflict 2026-10-29 1530).md");
    assert_eq!(text(&r.writes[1].1), "mine");
  }

  #[test]
  fn deleted_on_one_side_keeps_the_changed() {
    let r = resolve(
      &conflict("Foo.md", Some("a"), None, Some("b")),
      STAMP,
      &|_| false,
    );
    assert_eq!(r.writes, vec![("Foo.md".into(), Some(b"b".to_vec()))]);
    let r = resolve(
      &conflict("Foo.md", Some("a"), Some("c"), None),
      STAMP,
      &|_| false,
    );
    assert_eq!(r.writes, vec![("Foo.md".into(), Some(b"c".to_vec()))]);
    assert_eq!(r.copy, None);
  }

  #[test]
  fn the_copy_takes_a_free_name() {
    let taken = |p: &str| {
      p == "a/Foo.epub (conflict s).md" || p == "a/Foo.epub (conflict s 2).md"
    };
    assert_eq!(
      copy_path("a/Foo.epub.md", "s", &taken),
      "a/Foo.epub (conflict s 3).md"
    );
    assert_eq!(copy_path("README", "s", &|_| false), "README (conflict s)");
    assert_eq!(copy_path(".env", "s", &|_| false), ".env (conflict s)");
  }

  #[test]
  fn data_json_is_merged() {
    let base = r#"{"version":1,"books":{"a":{"title":"A","group":"x"}}}"#;
    let ours = r#"{"version":1,"books":{"a":{"title":"A","group":"y"}}}"#;
    let theirs =
      r#"{"version":1,"books":{"a":{"title":"A!","group":"x"},"b":{"title":"B"}}}"#;
    let r = resolve(
      &conflict(".mdsilo/books.json", Some(base), Some(ours), Some(theirs)),
      STAMP,
      &|_| false,
    );
    assert_eq!(r.copy, None);
    let merged: Value = serde_json::from_str(text(&r.writes[0].1)).unwrap();
    assert_eq!(
      merged,
      json!({"version":1,"books":{"a":{"title":"A!","group":"y"},"b":{"title":"B"}}})
    );
    assert!(text(&r.writes[0].1).ends_with("}\n"));
  }

  #[test]
  fn records_merge_by_id_and_removals_carry_over() {
    let base = json!({"entries": [{"id": "1", "w": "a"}, {"id": "2", "w": "b"}]});
    let ours = json!({"entries": [{"id": "3", "w": "c"}, {"id": "1", "w": "a", "n": 1}, {"id": "2", "w": "b"}]});
    let theirs = json!({"entries": [{"id": "4", "w": "d"}, {"id": "1", "w": "a"}]});
    let merged = merge_json(Some(&base), &ours, &theirs);
    assert_eq!(
      merged,
      json!({"entries": [{"id": "3", "w": "c"}, {"id": "1", "w": "a", "n": 1}, {"id": "4", "w": "d"}]})
    );
  }

  #[test]
  fn plain_lists_merge_as_sets() {
    let merged = merge_json(
      Some(&json!(["a", "b"])),
      &json!(["a", "b", "c"]),
      &json!(["b", "d"]),
    );
    assert_eq!(merged, json!(["b", "c", "d"]));
  }

  #[test]
  fn values_changed_on_both_sides_keep_ours() {
    let merged =
      merge_json(Some(&json!({"p": 1})), &json!({"p": 2}), &json!({"p": 3}));
    assert_eq!(merged, json!({"p": 2}));
    // added on both sides, no base
    let merged =
      merge_json(None, &json!({"a": 1, "c": [1]}), &json!({"b": 2, "c": [2]}));
    assert_eq!(merged, json!({"a": 1, "c": [1, 2], "b": 2}));
  }

  #[test]
  fn invalid_data_json_takes_theirs() {
    let r = resolve(
      &conflict(".mdsilo/x.json", None, Some("{"), Some("{}")),
      STAMP,
      &|_| false,
    );
    assert_eq!(
      r.writes,
      vec![(".mdsilo/x.json".into(), Some(b"{}".to_vec()))]
    );
  }

  #[test]
  fn gitignore_keeps_the_lines_of_both() {
    let c = conflict(
      "reading/.gitignore",
      Some("*.epub\n"),
      Some("*.epub\n!/a.epub\n"),
      Some("*.epub\n!/b.epub\n"),
    );
    let r = resolve(&c, STAMP, &|_| false);
    assert_eq!(text(&r.writes[0].1), "*.epub\n!/b.epub\n!/a.epub\n");
  }
}
