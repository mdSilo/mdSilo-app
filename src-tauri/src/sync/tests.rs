//! Two devices syncing through a remote: a bare repo on disk, or served over
//! HTTP by `git` (skipped without it).

use super::*;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

/// A fresh dir, removed when dropped.
struct TempDir(PathBuf);

impl TempDir {
  fn new(name: &str) -> Self {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("mdsilo-sync-{name}-{}-{n}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    Self(dir)
  }
}

impl Drop for TempDir {
  fn drop(&mut self) {
    let _ = fs::remove_dir_all(&self.0);
  }
}

struct Setup {
  _tmp: TempDir,
  remote: PathBuf,
  creds: PathBuf,
  a: PathBuf,
  b: PathBuf,
}

fn setup(name: &str) -> Setup {
  let tmp = TempDir::new(name);
  let remote = tmp.0.join("remote.git");
  git2::Repository::init_bare(&remote).unwrap();
  let a = tmp.0.join("a");
  let b = tmp.0.join("b");
  fs::create_dir_all(&a).unwrap();
  fs::create_dir_all(&b).unwrap();
  let creds = tmp.0.join("creds.json");
  Setup { remote, creds, a, b, _tmp: tmp }
}

fn write(root: &Path, path: &str, text: &str) {
  let file = root.join(path);
  fs::create_dir_all(file.parent().unwrap()).unwrap();
  fs::write(file, text).unwrap();
}

fn read(root: &Path, path: &str) -> String {
  fs::read_to_string(root.join(path)).unwrap_or_default()
}

fn connect(s: &Setup, root: &Path) {
  let setup = SyncSetup {
    url: s.remote.to_str().unwrap().to_string(),
    username: None,
    token: None,
    author_name: Some("Tester".into()),
    author_email: Some("t@example.com".into()),
  };
  setup_in(root, &s.creds, setup).unwrap();
}

fn run(s: &Setup, root: &Path) -> SyncReport {
  sync_in(root, &s.creds).unwrap()
}

/// a workspace as the app lays it out
fn layout(root: &Path) {
  write(root, ".mdsilo/.gitignore", "local/\n");
  write(root, ".mdsilo/workspace.json", "{\n  \"version\": 1\n}\n");
  write(root, "reading/.gitignore", "*.epub\n");
  write(root, ".mdsilo/local/index.db", "local");
}

#[test]
fn the_first_device_pushes_the_second_takes_all() {
  let s = setup("first");
  layout(&s.a);
  write(&s.a, "writing/Hello.md", "# Hello\n");
  write(&s.a, "reading/Book.epub", "not synced");
  connect(&s, &s.a);
  let info = info_of(&s.a, &s.creds).unwrap();
  assert!(info.is_repo);
  assert_eq!(info.branch.as_deref(), Some("main"));
  assert_eq!(info.author_name.as_deref(), Some("Tester"));
  assert!(info.changes > 0);

  let report = run(&s, &s.a);
  assert!(report.committed && report.pushed);
  assert_eq!(info_of(&s.a, &s.creds).unwrap().changes, 0);

  connect(&s, &s.b);
  let report = run(&s, &s.b);
  assert!(!report.committed);
  assert!(report.pulled.contains(&"writing/Hello.md".to_string()));
  assert_eq!(read(&s.b, "writing/Hello.md"), "# Hello\n");
  assert_eq!(read(&s.b, ".mdsilo/workspace.json"), read(&s.a, ".mdsilo/workspace.json"));
  // ignored: the local data, the books not synced
  assert!(!s.b.join(".mdsilo/local/index.db").exists());
  assert!(!s.b.join("reading/Book.epub").exists());

  // nothing to do
  assert_eq!(run(&s, &s.b), SyncReport::default());
}

#[test]
fn changes_on_both_devices_merge() {
  let s = setup("merge");
  write(&s.a, "writing/A.md", "a\n");
  write(&s.a, "writing/Shared.md", "one\ntwo\nthree\nfour\nfive\n");
  connect(&s, &s.a);
  run(&s, &s.a);
  connect(&s, &s.b);
  run(&s, &s.b);

  write(&s.a, "writing/A.md", "a, changed\n");
  write(&s.a, "writing/Shared.md", "ONE\ntwo\nthree\nfour\nfive\n");
  fs::remove_file(s.a.join("writing/A.md")).unwrap();
  run(&s, &s.a);
  write(&s.b, "writing/B.md", "b\n");
  write(&s.b, "writing/Shared.md", "one\ntwo\nthree\nfour\nFIVE\n");
  let report = run(&s, &s.b);
  assert!(report.pushed);
  assert!(report.conflicts.is_empty());
  assert_eq!(read(&s.b, "writing/Shared.md"), "ONE\ntwo\nthree\nfour\nFIVE\n");
  assert!(!s.b.join("writing/A.md").exists());

  run(&s, &s.a);
  assert_eq!(read(&s.a, "writing/B.md"), "b\n");
  assert_eq!(read(&s.a, "writing/Shared.md"), "ONE\ntwo\nthree\nfour\nFIVE\n");
}

#[test]
fn a_note_changed_on_both_devices_keeps_both() {
  let s = setup("conflict");
  write(&s.a, "writing/Note.md", "first\n");
  connect(&s, &s.a);
  run(&s, &s.a);
  connect(&s, &s.b);
  run(&s, &s.b);

  write(&s.a, "writing/Note.md", "from a\n");
  run(&s, &s.a);
  write(&s.b, "writing/Note.md", "from b\n");
  let report = run(&s, &s.b);
  assert!(report.pushed);
  assert_eq!(report.conflicts.len(), 1);
  let conflict = &report.conflicts[0];
  assert_eq!(conflict.path, "writing/Note.md");
  let copy = conflict.copy.clone().unwrap();
  assert!(copy.starts_with("writing/Note (conflict "), "{copy}");
  assert_eq!(read(&s.b, "writing/Note.md"), "from a\n");
  assert_eq!(read(&s.b, &copy), "from b\n");

  // the copy reaches the other device
  run(&s, &s.a);
  assert_eq!(read(&s.a, &copy), "from b\n");
}

#[test]
fn the_data_of_the_app_merges_as_json() {
  let s = setup("json");
  let books = |a: &str, b: &str| format!("{{\n  \"version\": 1,\n  \"books\": {{\n    \"x\": {{\n      \"title\": \"{a}\",\n      \"group\": \"{b}\"\n    }}\n  }}\n}}\n");
  write(&s.a, ".mdsilo/books.json", &books("X", "g"));
  write(&s.a, "reading/.gitignore", "*.epub\n");
  connect(&s, &s.a);
  run(&s, &s.a);
  connect(&s, &s.b);
  run(&s, &s.b);

  // the lines next to each other: a text merge would conflict
  write(&s.a, ".mdsilo/books.json", &books("X!", "g"));
  write(&s.a, "reading/.gitignore", "*.epub\n!/a.epub\n");
  run(&s, &s.a);
  write(&s.b, ".mdsilo/books.json", &books("X", "h"));
  write(&s.b, "reading/.gitignore", "*.epub\n!/b.epub\n");
  let report = run(&s, &s.b);
  assert_eq!(report.conflicts.iter().map(|c| c.copy.clone()).collect::<Vec<_>>(), vec![None]);
  let merged: serde_json::Value = serde_json::from_str(&read(&s.b, ".mdsilo/books.json")).unwrap();
  assert_eq!(merged["books"]["x"]["title"], "X!");
  assert_eq!(merged["books"]["x"]["group"], "h");
  let gitignore = read(&s.b, "reading/.gitignore");
  assert!(gitignore.contains("!/a.epub") && gitignore.contains("!/b.epub"), "{gitignore}");
}

#[test]
fn a_book_no_longer_synced_stays_on_the_other_device() {
  let s = setup("unsync");
  write(&s.a, "reading/.gitignore", "*.epub\n!/Book.epub\n");
  write(&s.a, "reading/Book.epub", "book");
  connect(&s, &s.a);
  run(&s, &s.a);
  connect(&s, &s.b);
  run(&s, &s.b);
  assert_eq!(read(&s.b, "reading/Book.epub"), "book");

  write(&s.a, "reading/.gitignore", "*.epub\n");
  run(&s, &s.a);
  assert_eq!(read(&s.a, "reading/Book.epub"), "book");
  let report = run(&s, &s.b);
  assert_eq!(report.pulled, vec!["reading/.gitignore".to_string()]);
  assert_eq!(read(&s.b, "reading/Book.epub"), "book");
}

#[test]
fn two_workspaces_started_apart_merge() {
  let s = setup("unrelated");
  layout(&s.a);
  write(&s.a, "writing/A.md", "a\n");
  connect(&s, &s.a);
  run(&s, &s.a);
  // a workspace made on the other device before connecting it
  layout(&s.b);
  write(&s.b, ".mdsilo/workspace.json", "{\n  \"version\": 1,\n  \"createdAt\": \"b\"\n}\n");
  write(&s.b, "writing/B.md", "b\n");
  connect(&s, &s.b);
  let report = run(&s, &s.b);
  assert!(report.pushed);
  assert!(report.conflicts.iter().all(|c| c.copy.is_none()));
  assert_eq!(read(&s.b, "writing/A.md"), "a\n");
  assert_eq!(read(&s.b, "writing/B.md"), "b\n");
}

#[test]
fn the_token_is_kept_out_of_the_workspace() {
  let s = setup("token");
  let mut setup = SyncSetup {
    url: "https://example.com/me/notes.git/".into(),
    username: Some(" me ".into()),
    token: Some("secret".into()),
    author_name: None,
    author_email: None,
  };
  let info = setup_in(&s.a, &s.creds, setup.clone()).unwrap();
  assert_eq!(info.remote_url.as_deref(), Some("https://example.com/me/notes.git"));
  assert_eq!(info.username.as_deref(), Some("me"));
  assert!(info.has_token);
  let config = read(&s.a, ".git/config");
  assert!(!config.contains("secret"));
  assert!(fs::read_to_string(&s.creds).unwrap().contains("secret"));

  // kept when not given, also for a new URL
  setup.url = "https://example.com/me/other.git".into();
  setup.token = None;
  assert!(setup_in(&s.a, &s.creds, setup.clone()).unwrap().has_token);
  // forgotten when empty
  setup.token = Some(String::new());
  assert!(!setup_in(&s.a, &s.creds, setup.clone()).unwrap().has_token);

  setup.url = "git@github.com:me/notes.git".into();
  assert!(setup_in(&s.a, &s.creds, setup).unwrap_err().contains("SSH"));
}

// smart HTTP, served by `git upload-pack` and `git receive-pack`

fn has_git() -> bool {
  Command::new("git").arg("--version").output().is_ok_and(|o| o.status.success())
}

/// Serve the bare repo at `http://127.0.0.1:<port>/repo.git`, with basic
/// auth `user:token` required.
fn serve(repo: PathBuf, auth: &'static str) -> String {
  let listener = TcpListener::bind("127.0.0.1:0").unwrap();
  let port = listener.local_addr().unwrap().port();
  std::thread::spawn(move || {
    for stream in listener.incoming() {
      let Ok(mut stream) = stream else { continue };
      let mut reader = BufReader::new(stream.try_clone().unwrap());
      let mut line = String::new();
      reader.read_line(&mut line).unwrap();
      let target = line.split_whitespace().nth(1).unwrap_or("").to_string();
      let mut length = 0;
      let mut authorized = false;
      loop {
        let mut header = String::new();
        reader.read_line(&mut header).unwrap();
        let header = header.trim_end();
        if header.is_empty() {
          break;
        }
        let (name, value) = header.split_once(": ").unwrap_or((header, ""));
        match name.to_lowercase().as_str() {
          "content-length" => length = value.parse().unwrap(),
          "authorization" => authorized = value == format!("Basic {}", base64(auth)),
          _ => {}
        }
      }
      let mut body = vec![0; length];
      reader.read_exact(&mut body).unwrap();
      if !authorized {
        let _ = stream.write_all(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        continue;
      }
      let (service, advertise) = if let Some(query) = target.split("?service=git-").nth(1) {
        (query.to_string(), true)
      } else {
        (target.rsplit("/git-").next().unwrap().to_string(), false)
      };
      let mut cmd = Command::new("git");
      cmd.arg(&service).arg("--stateless-rpc");
      if advertise {
        cmd.arg("--advertise-refs");
      }
      let mut child = cmd.arg(&repo).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
      child.stdin.take().unwrap().write_all(&body).unwrap();
      let output = child.wait_with_output().unwrap().stdout;
      let mut payload = Vec::new();
      let kind = if advertise {
        let first = format!("# service=git-{service}\n");
        payload.extend(format!("{:04x}{first}0000", first.len() + 4).as_bytes());
        "advertisement"
      } else {
        "result"
      };
      payload.extend(output);
      let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/x-git-{service}-{kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        payload.len()
      );
      let _ = stream.write_all(head.as_bytes());
      let _ = stream.write_all(&payload);
    }
  });
  format!("http://127.0.0.1:{port}/repo.git")
}

fn base64(text: &str) -> String {
  const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let bytes = text.as_bytes();
  let mut out = String::new();
  for chunk in bytes.chunks(3) {
    let n = chunk.iter().enumerate().fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
    for i in 0..4 {
      if i <= chunk.len() {
        out.push(CHARS[(n >> (18 - 6 * i) & 63) as usize] as char);
      } else {
        out.push('=');
      }
    }
  }
  out
}

#[test]
fn sync_over_http_with_a_token() {
  if !has_git() {
    eprintln!("git not found, skipped");
    return;
  }
  let s = setup("http");
  let url = serve(s.remote.clone(), "me:secret");
  let connect_http = |root: &Path, token: &str| {
    let setup = SyncSetup {
      url: url.clone(),
      username: Some("me".into()),
      token: Some(token.into()),
      author_name: None,
      author_email: None,
    };
    setup_in(root, &s.creds, setup).unwrap();
  };

  write(&s.a, "writing/Hello.md", "over http\n");
  connect_http(&s.a, "wrong");
  let e = sync_in(&s.a, &s.creds).unwrap_err();
  assert!(e.contains("authentication failed"), "{e}");

  connect_http(&s.a, "secret");
  assert!(run(&s, &s.a).pushed);
  write(&s.a, "writing/Hello.md", "over http, again\n");
  run(&s, &s.a);

  connect_http(&s.b, "secret");
  run(&s, &s.b);
  assert_eq!(read(&s.b, "writing/Hello.md"), "over http, again\n");
}

/// HTTPS to GitHub, with the TLS of reqwest: `cargo test -- --ignored`.
#[test]
#[ignore = "network"]
fn fetch_a_public_repo_over_https() {
  let s = setup("github");
  let mut repo = open_repo(&s.a, true).unwrap().unwrap();
  let remote = Remote { url: "https://github.com/octocat/Hello-World.git".into(), credentials: None };
  let theirs = repo.fetch(&remote, "master").unwrap().expect("the branch");
  assert_eq!(repo.relation(&theirs).unwrap(), Relation::Behind);
  repo.fast_forward(&theirs).unwrap();
  assert!(s.a.join("README").exists());
}
