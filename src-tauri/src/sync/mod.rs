//! Sync a workspace with a git remote (GitHub, Gitea...) over HTTPS, with a
//! token: commit every change, fetch, merge, push.
//!
//! - repo.rs: the git operations, behind a trait; git2_repo.rs implements
//!   them (`open_repo` is the one place naming the library).
//! - http.rs: HTTPS for libgit2, with reqwest.
//! - resolve.rs: a file changed on both sides: nothing lost, see there.
//!
//! The token is kept in the app's data dir, by remote, never in the
//! workspace nor in `.git/config`.

pub mod git2_repo;
pub mod http;
pub mod repo;
pub mod resolve;
#[cfg(test)]
mod tests;

use crate::atomic::write_atomic;
use http::Credentials;
use repo::{Author, Relation, Remote, Repo, Result};
use resolve::resolve;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// a push refused as the remote moved on: fetch, merge, push again
const MAX_ROUNDS: usize = 3;

pub(crate) const DEFAULT_AUTHOR: &str = "mdSilo";
pub(crate) const DEFAULT_EMAIL: &str = "mdsilo@localhost";
const DEFAULT_USERNAME: &str = "mdsilo";

pub(crate) fn open_repo(root: &Path, create: bool) -> Result<Option<Box<dyn Repo>>> {
  http::register();
  if create {
    return Ok(Some(Box::new(git2_repo::Git2Repo::init(root)?)));
  }
  Ok(git2_repo::Git2Repo::open(root)?.map(|r| Box::new(r) as Box<dyn Repo>))
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictReport {
  pub path: String,
  /// where this device's version was kept, beside the file
  pub copy: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
  /// the changes here were committed
  pub committed: bool,
  /// the files changed by the remote, relative to the workspace
  pub pulled: Vec<String>,
  pub pushed: bool,
  pub conflicts: Vec<ConflictReport>,
}

/// One sync: commit, fetch, fast-forward or merge, push. `stamp` dates the
/// commits and the copies of conflicts; `exists` says if a path is taken.
pub fn sync(
  repo: &mut dyn Repo,
  remote: &Remote,
  author: &Author,
  stamp: &str,
  exists: &dyn Fn(&str) -> bool,
) -> Result<SyncReport> {
  // a new repo takes the branch of the remote (e.g. `master`), not to push
  // another one beside it; a branch with commits stays as it is
  if !repo.has_commits()?
    && let Some(theirs) = repo.remote_default_branch(remote)?
  {
    repo.set_unborn_branch(&theirs)?;
  }
  let branch = repo.branch()?;
  let mut report = SyncReport {
    committed: repo.commit_all(&format!("Sync {stamp}"), author)?,
    ..Default::default()
  };
  for _ in 0..MAX_ROUNDS {
    let theirs = repo.fetch(remote, &branch)?;
    let relation = match &theirs {
      Some(theirs) => repo.relation(theirs)?,
      None => Relation::Ahead,
    };
    match (relation, &theirs) {
      (Relation::UpToDate, _) => return Ok(report),
      (Relation::Behind, Some(theirs)) => {
        report.pulled.extend(repo.fast_forward(theirs)?);
        return Ok(report);
      }
      (Relation::Diverged, Some(theirs)) => {
        let mut resolver = |c: &resolve::Conflict| resolve(c, stamp, exists);
        let merged = repo.merge(theirs, &mut resolver, &format!("Merge {stamp}"), author)?;
        report.pulled.extend(merged.changed);
        report.conflicts.extend(
          merged
            .conflicts
            .into_iter()
            .map(|(path, resolved)| ConflictReport { path, copy: resolved.copy }),
        );
      }
      _ => {}
    }
    if repo.push(remote, &branch)? {
      report.pushed = true;
      return Ok(report);
    }
  }
  Err("The remote kept changing during the sync, try again later".into())
}

// the tokens, by remote URL

#[derive(Debug, Default, Serialize, Deserialize)]
struct CredentialStore {
  remotes: BTreeMap<String, StoredCredentials>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredCredentials {
  username: String,
  token: String,
}

pub(crate) fn credentials_file() -> Result<PathBuf> {
  crate::storage::data_dir()
    .map(|dir| dir.join("sync-credentials.json"))
    .ok_or_else(|| "No data dir for the credentials".into())
}

fn read_store(file: &Path) -> CredentialStore {
  std::fs::read(file)
    .ok()
    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    .unwrap_or_default()
}

pub(crate) fn load_credentials(file: &Path, url: &str) -> Option<Credentials> {
  read_store(file)
    .remotes
    .get(url)
    .map(|c| Credentials { username: c.username.clone(), token: c.token.clone() })
}

/// Save or, without a token, forget the credentials of a remote.
fn save_credentials(file: &Path, url: &str, credentials: Option<&Credentials>) -> Result<()> {
  let mut store = read_store(file);
  match credentials {
    Some(c) => store.remotes.insert(
      url.to_string(),
      StoredCredentials { username: c.username.clone(), token: c.token.clone() },
    ),
    None => store.remotes.remove(url),
  };
  let data = serde_json::to_vec_pretty(&store).map_err(|e| e.to_string())?;
  write_atomic(file, &data).map_err(|e| e.to_string())?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600));
  }
  Ok(())
}

/// The URL as kept: no `/` at the end; an SSH remote is not supported yet.
pub(crate) fn normalize_url(url: &str) -> Result<String> {
  let url = url.trim().trim_end_matches('/');
  let lower = url.to_lowercase();
  if lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("file://") || Path::new(url).is_absolute() {
    return Ok(url.to_string());
  }
  if lower.starts_with("git@") || lower.starts_with("ssh://") {
    return Err("SSH remotes are not supported yet: use the HTTPS URL of the repository".into());
  }
  Err(format!("Not a remote URL: {url}"))
}

pub(crate) fn stamp() -> String {
  chrono::Local::now().format("%Y-%m-%d %H%M").to_string()
}

// the commands

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncInfo {
  /// sync is set up: the workspace is a git repo
  pub is_repo: bool,
  pub branch: Option<String>,
  pub remote_url: Option<String>,
  pub username: Option<String>,
  pub has_token: bool,
  pub author_name: Option<String>,
  pub author_email: Option<String>,
  /// the files changed since the last sync
  pub changes: usize,
}

fn info_of(root: &Path, file: &Path) -> Result<SyncInfo> {
  let Some(repo) = open_repo(root, false)? else {
    return Ok(SyncInfo::default());
  };
  let remote_url = repo.remote_url()?;
  let credentials = remote_url.as_deref().and_then(|url| load_credentials(file, url));
  let author = repo.author()?;
  Ok(SyncInfo {
    is_repo: true,
    branch: repo.branch().ok(),
    username: credentials.as_ref().map(|c| c.username.clone()),
    has_token: credentials.is_some(),
    remote_url,
    author_name: author.as_ref().map(|a| a.name.clone()),
    author_email: author.map(|a| a.email),
    changes: repo.changes()?.len(),
  })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSetup {
  pub url: String,
  pub username: Option<String>,
  /// None: keep the token saved; empty: forget it
  pub token: Option<String>,
  pub author_name: Option<String>,
  pub author_email: Option<String>,
}

pub(crate) fn setup_in(root: &Path, file: &Path, setup: SyncSetup) -> Result<SyncInfo> {
  let url = normalize_url(&setup.url)?;
  let mut repo = open_repo(root, true)?.ok_or("No repo")?;
  let old_url = repo.remote_url()?;
  repo.set_remote_url(&url)?;
  let name = setup.author_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
  if let Some(name) = name {
    let email = setup.author_email.map(|s| s.trim().to_string()).unwrap_or_default();
    repo.set_author(&Author { name, email })?;
  }
  let username = setup
    .username
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| DEFAULT_USERNAME.to_string());
  let token = match setup.token {
    Some(token) => Some(token.trim().to_string()).filter(|t| !t.is_empty()),
    // kept, also when the URL changed
    None => old_url
      .as_deref()
      .and_then(|old| load_credentials(file, old))
      .or_else(|| load_credentials(file, &url))
      .map(|c| c.token),
  };
  let credentials = token.map(|token| Credentials { username, token });
  save_credentials(file, &url, credentials.as_ref())?;
  info_of(root, file)
}

fn sync_in(root: &Path, file: &Path) -> Result<SyncReport> {
  let mut repo = open_repo(root, false)?.ok_or("Sync is not set up for this workspace")?;
  let url = repo.remote_url()?.ok_or("No remote to sync with")?;
  let url = normalize_url(&url)?;
  let remote = Remote { credentials: load_credentials(file, &url), url };
  let author = author_of(repo.as_ref())?;
  sync(repo.as_mut(), &remote, &author, &stamp(), &|path| root.join(path).exists())
}

/// The author of the commits: as configured, or mdSilo.
pub(crate) fn author_of(repo: &dyn Repo) -> Result<Author> {
  // git takes no empty email: the name set, the email left out
  Ok(match repo.author()? {
    Some(Author { name, email }) if email.trim().is_empty() => Author { name, email: DEFAULT_EMAIL.into() },
    Some(author) => author,
    None => Author { name: DEFAULT_AUTHOR.into(), email: DEFAULT_EMAIL.into() },
  })
}

/// one sync at a time
pub(crate) static SYNCING: Mutex<()> = Mutex::new(());

pub(crate) async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sync_info(dir: String) -> Result<SyncInfo> {
  blocking(move || info_of(Path::new(&dir), &credentials_file()?)).await
}

#[tauri::command]
pub async fn sync_setup(dir: String, setup: SyncSetup) -> Result<SyncInfo> {
  blocking(move || {
    let _lock = SYNCING.try_lock().map_err(|_| "A sync is running")?;
    setup_in(Path::new(&dir), &credentials_file()?, setup)
  })
  .await
}

#[tauri::command]
pub async fn sync_run(dir: String) -> Result<SyncReport> {
  blocking(move || {
    let _lock = SYNCING.try_lock().map_err(|_| "A sync is running")?;
    sync_in(Path::new(&dir), &credentials_file()?)
  })
  .await
}
