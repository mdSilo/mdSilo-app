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

#[cfg(test)]
mod tests {
  use super::*;
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
