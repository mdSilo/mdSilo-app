//! The static site of a workspace (built by packages/publish): written to a
//! folder, and pushed to the `gh-pages` branch of the remote of the sync.

use crate::sync::repo::{Remote, Result};
use crate::sync::{
  SYNCING, author_of, blocking, credentials_file, load_credentials, normalize_url,
  open_repo, stamp,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

/// the branch GitHub Pages serves
const PAGES_BRANCH: &str = "gh-pages";

/// A file of the site: its text, or a file of the workspace to copy.
#[derive(Debug, Clone, Deserialize)]
pub struct SiteFile {
  path: String,
  text: Option<String>,
  copy: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Written {
  pub files: usize,
  /// files to copy not found in the workspace, skipped
  pub missing: Vec<String>,
}

/// A relative path that stays under its root: no `..`, no root, no drive.
fn safe_join(root: &Path, rel: &str) -> Option<PathBuf> {
  let rel = Path::new(rel);
  rel
    .components()
    .all(|c| matches!(c, Component::Normal(_)))
    .then(|| root.join(rel))
}

/// Write the site to `target`, emptied first if `clear` (the site of the app
/// only, never a folder of the user).
fn write_site(
  ws: &Path,
  target: &Path,
  files: &[SiteFile],
  clear: bool,
) -> Result<Written> {
  if clear && target.exists() {
    fs::remove_dir_all(target).map_err(|e| e.to_string())?;
  }
  let mut written = Written::default();
  for file in files {
    let to = safe_join(target, &file.path)
      .ok_or_else(|| format!("Not a path of the site: {}", file.path))?;
    if let Some(dir) = to.parent() {
      fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    if let Some(text) = &file.text {
      fs::write(&to, text).map_err(|e| e.to_string())?;
    } else if let Some(copy) = &file.copy {
      match safe_join(ws, copy).filter(|from| from.is_file()) {
        Some(from) => {
          fs::copy(from, &to).map_err(|e| e.to_string())?;
        }
        None => {
          written.missing.push(copy.clone());
          continue;
        }
      }
    }
    written.files += 1;
  }
  Ok(written)
}

/// Where GitHub Pages serves a repo: `https://<owner>.github.io/<repo>/`.
pub fn pages_url(remote: &str) -> Option<String> {
  let rest = remote.strip_prefix("https://github.com/")?;
  let mut parts = rest
    .trim_end_matches('/')
    .trim_end_matches(".git")
    .split('/');
  let (owner, repo) = (parts.next()?, parts.next()?);
  if owner.is_empty() || repo.is_empty() || parts.next().is_some() {
    return None;
  }
  let host = format!("{}.github.io", owner.to_lowercase());
  Some(if repo.to_lowercase() == host {
    format!("https://{host}/")
  } else {
    format!("https://{host}/{repo}/")
  })
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pushed {
  pub branch: String,
  /// the address of the site, if known (GitHub)
  pub url: Option<String>,
}

fn push_site(ws: &Path, site: &Path, credentials: &Path) -> Result<Pushed> {
  let mut repo = open_repo(ws, false)?
    .ok_or("Set up the sync first: the site goes to its remote")?;
  let url = normalize_url(&repo.remote_url()?.ok_or("No remote to publish to")?)?;
  let remote = Remote {
    credentials: load_credentials(credentials, &url),
    url: url.clone(),
  };
  let author = author_of(repo.as_ref())?;
  repo.push_dir(
    &remote,
    site,
    PAGES_BRANCH,
    &format!("Publish {}", stamp()),
    &author,
  )?;
  Ok(Pushed {
    branch: PAGES_BRANCH.into(),
    url: pages_url(&url),
  })
}

#[tauri::command]
pub async fn publish_write(
  dir: String,
  target: String,
  files: Vec<SiteFile>,
  clear: bool,
) -> Result<Written> {
  blocking(move || write_site(Path::new(&dir), Path::new(&target), &files, clear))
    .await
}

#[tauri::command]
pub async fn publish_push(dir: String, site: String) -> Result<Pushed> {
  blocking(move || {
    let _lock = SYNCING.try_lock().map_err(|_| "A sync is running")?;
    push_site(Path::new(&dir), Path::new(&site), &credentials_file()?)
  })
  .await
}

/// The most of a front matter read: a longer one is taken as none.
const MAX_FRONT_MATTER: usize = 64 * 1024;

/// The front matter of a file, `---` ... `---` at its start as frontMatter
/// of packages/publish reads it, with its lines; "" if none. Only it read,
/// not the rest of the file.
fn front_matter_of(path: &Path) -> String {
  use std::io::{BufRead, BufReader};
  let Ok(file) = fs::File::open(path) else {
    return String::new();
  };
  let mut reader = BufReader::new(file);
  let mut out = Vec::new();
  let mut line = Vec::new();
  for i in 0.. {
    line.clear();
    match reader.read_until(b'\n', &mut line) {
      Ok(0) | Err(_) => return String::new(),
      Ok(_) => {}
    }
    out.extend_from_slice(&line);
    let text = line.strip_suffix(b"\n").unwrap_or(&line);
    let text = text.strip_suffix(b"\r").unwrap_or(text);
    if i == 0 {
      // `---` and a line break, nothing else
      if text != b"---" || !line.ends_with(b"\n") {
        return String::new();
      }
    } else if i >= 2
      && text.starts_with(b"---")
      && text[3..].iter().all(|b| *b == b' ' || *b == b'\t')
    {
      // closed: not by the line right after the opening one
      return String::from_utf8_lossy(&out).into_owned();
    }
    if out.len() > MAX_FRONT_MATTER {
      return String::new();
    }
  }
  String::new()
}

/// The front matter of each file, "" if none: to know if a note is published
/// without reading it whole.
#[tauri::command]
pub async fn read_front_matters(paths: Vec<String>) -> Vec<String> {
  tauri::async_runtime::spawn_blocking(move || {
    paths
      .iter()
      .map(|p| front_matter_of(Path::new(p)))
      .collect()
  })
  .await
  .unwrap_or_default()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_front_matter_only() {
    let dir = temp("front-matter");
    let cases = [
      (
        "---\npublish: true\n---\n# Body",
        "---\npublish: true\n---\n",
      ),
      ("---\r\na: 1\r\n---  \r\nbody", "---\r\na: 1\r\n---  \r\n"),
      // closed at the end of the file
      ("---\na: 1\n---", "---\na: 1\n---"),
      // not closed by the line right after
      ("---\n---\na: 1\n---\nbody", "---\n---\na: 1\n---\n"),
      ("---\n\n---\nbody", "---\n\n---\n"),
      ("# No front matter\n---\n", ""),
      ("--- \na: 1\n---\n", ""),
      ("---\nnot closed\n", ""),
    ];
    for (i, (content, want)) in cases.iter().enumerate() {
      let path = dir.join(format!("{i}.md"));
      fs::write(&path, content).unwrap();
      assert_eq!(front_matter_of(&path), *want, "case {i}");
    }
    assert_eq!(front_matter_of(&dir.join("missing.md")), "");
    let long = format!("---\n{}\n---\n", "a: 1\n".repeat(MAX_FRONT_MATTER / 5 + 1));
    fs::write(dir.join("long.md"), long).unwrap();
    assert_eq!(front_matter_of(&dir.join("long.md")), "");
    let _ = fs::remove_dir_all(&dir);
  }
  use crate::sync::{SyncSetup, setup_in};

  fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir()
      .join(format!("mdsilo-publish-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  fn text(path: &str, text: &str) -> SiteFile {
    SiteFile {
      path: path.into(),
      text: Some(text.into()),
      copy: None,
    }
  }

  #[test]
  fn the_site_is_written_under_its_folder() {
    let root = temp("write");
    let (ws, site) = (root.join("ws"), root.join("site"));
    fs::create_dir_all(ws.join("writing/assets")).unwrap();
    fs::write(ws.join("writing/assets/a.png"), "png").unwrap();
    fs::create_dir_all(&site).unwrap();
    fs::write(site.join("old.html"), "old").unwrap();
    let files = vec![
      text("index.html", "home"),
      text("notes/a/b.html", "b"),
      SiteFile {
        path: "files/a.png".into(),
        text: None,
        copy: Some("writing/assets/a.png".into()),
      },
      SiteFile {
        path: "files/x.png".into(),
        text: None,
        copy: Some("writing/none.png".into()),
      },
    ];
    let written = write_site(&ws, &site, &files, true).unwrap();
    assert_eq!(
      written,
      Written {
        files: 3,
        missing: vec!["writing/none.png".into()]
      }
    );
    assert!(!site.join("old.html").exists());
    assert_eq!(
      fs::read_to_string(site.join("notes/a/b.html")).unwrap(),
      "b"
    );
    assert_eq!(fs::read_to_string(site.join("files/a.png")).unwrap(), "png");

    for bad in ["../x.html", "/etc/x", "a/../../x"] {
      assert!(
        write_site(&ws, &site, &[text(bad, "x")], false).is_err(),
        "{bad}"
      );
    }
    let escape = SiteFile {
      path: "f".into(),
      text: None,
      copy: Some("../secret".into()),
    };
    assert_eq!(
      write_site(&ws, &site, &[escape], false).unwrap().missing,
      vec!["../secret".to_string()]
    );
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn pages_urls_of_github() {
    assert_eq!(
      pages_url("https://github.com/Me/notes.git").as_deref(),
      Some("https://me.github.io/notes/")
    );
    assert_eq!(
      pages_url("https://github.com/me/me.github.io").as_deref(),
      Some("https://me.github.io/")
    );
    assert_eq!(pages_url("https://gitea.example.com/me/notes"), None);
    assert_eq!(pages_url("https://github.com/me"), None);
  }

  #[test]
  fn the_site_goes_to_its_branch_alone() {
    let root = temp("push");
    let (ws, site, remote, creds) = (
      root.join("ws"),
      root.join("site"),
      root.join("remote.git"),
      root.join("c.json"),
    );
    git2::Repository::init_bare(&remote).unwrap();
    fs::create_dir_all(ws.join("writing")).unwrap();
    fs::write(ws.join("writing/private.md"), "private").unwrap();
    let setup = SyncSetup {
      url: remote.to_str().unwrap().into(),
      username: None,
      token: None,
      author_name: None,
      author_email: None,
    };
    setup_in(&ws, &creds, setup).unwrap();
    assert!(push_site(&ws, &site, &creds).is_err()); // no site yet

    write_site(
      &ws,
      &site,
      &[
        text("index.html", "v1"),
        text("notes/a.html", "a"),
        text(".nojekyll", ""),
      ],
      true,
    )
    .unwrap();
    let pushed = push_site(&ws, &site, &creds).unwrap();
    assert_eq!(
      pushed,
      Pushed {
        branch: "gh-pages".into(),
        url: None
      }
    );
    write_site(
      &ws,
      &site,
      &[text("index.html", "v2"), text(".nojekyll", "")],
      true,
    )
    .unwrap();
    push_site(&ws, &site, &creds).unwrap();

    let bare = git2::Repository::open(&remote).unwrap();
    let commit = bare
      .find_reference("refs/heads/gh-pages")
      .unwrap()
      .peel_to_commit()
      .unwrap();
    assert_eq!(commit.parent_count(), 0); // no history kept
    let tree = commit.tree().unwrap();
    let names: Vec<_> = tree.iter().map(|e| e.name().unwrap().to_string()).collect();
    assert_eq!(names, vec![".nojekyll", "index.html"]);
    let blob = bare
      .find_blob(tree.get_name("index.html").unwrap().id())
      .unwrap();
    assert_eq!(blob.content(), b"v2");
    // the notes were not pushed, and the sync branch is untouched
    assert!(bare.find_reference("refs/heads/main").is_err());
    let _ = fs::remove_dir_all(root);
  }
}
