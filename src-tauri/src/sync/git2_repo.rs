//! `Repo` with git2 (libgit2).

use super::http::with_credentials;
use super::repo::{Author, CommitId, Merged, Relation, Remote, Repo, Result};
use super::resolve::{Conflict, Resolved};
use git2::build::CheckoutBuilder;
use git2::{
  AutotagOption, ConfigLevel, Direction, ErrorCode, FetchOptions, IndexAddOption, IndexEntry, IndexTime, Oid, PushOptions,
  RemoteCallbacks, Repository, Signature, StatusOptions, Tree,
};
use std::cell::RefCell;
use std::fs;
use std::path::{Path, PathBuf};

const REMOTE: &str = "origin";
const DEFAULT_BRANCH: &str = "main";

/// `.git/info/exclude`: never synced, whatever the .gitignore files say.
const EXCLUDE: &[&str] = &["/.mdsilo/local/", "*.mdsilo-tmp"];
/// `.git/info/attributes`: the data of the app is merged as JSON (see
/// resolve.rs), not by lines; the .gitignore files keep the lines of both.
const ATTRIBUTES: &[&str] = &["/.mdsilo/**/*.json merge=binary", ".gitignore merge=union"];

pub struct Git2Repo {
  repo: Repository,
  root: PathBuf,
}

fn err(e: git2::Error) -> String {
  e.message().to_string()
}

/// Add the lines missing to a file of `.git/info/`.
fn ensure_lines(path: &Path, lines: &[&str]) -> Result<()> {
  let text = fs::read_to_string(path).unwrap_or_default();
  let missing: Vec<&str> = lines.iter().copied().filter(|l| !text.lines().any(|t| t == *l)).collect();
  if missing.is_empty() {
    return Ok(());
  }
  let mut text = text;
  if !text.is_empty() && !text.ends_with('\n') {
    text.push('\n');
  }
  text.push_str("# mdSilo sync\n");
  for line in missing {
    text.push_str(line);
    text.push('\n');
  }
  if let Some(dir) = path.parent() {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  fs::write(path, text).map_err(|e| e.to_string())
}

impl Git2Repo {
  /// The repo at the root of the workspace (not one above it), if any.
  pub fn open(root: &Path) -> Result<Option<Self>> {
    if !root.join(".git").exists() {
      return Ok(None);
    }
    let repo = Repository::open(root).map_err(err)?;
    let this = Self { repo, root: root.to_path_buf() };
    this.ensure_info()?;
    Ok(Some(this))
  }

  pub fn init(root: &Path) -> Result<Self> {
    if let Some(this) = Self::open(root)? {
      return Ok(this);
    }
    let mut opts = git2::RepositoryInitOptions::new();
    opts.initial_head(DEFAULT_BRANCH);
    let repo = Repository::init_opts(root, &opts).map_err(err)?;
    let this = Self { repo, root: root.to_path_buf() };
    this.ensure_info()?;
    Ok(this)
  }

  fn ensure_info(&self) -> Result<()> {
    let info = self.repo.path().join("info");
    ensure_lines(&info.join("exclude"), EXCLUDE)?;
    ensure_lines(&info.join("attributes"), ATTRIBUTES)
  }

  fn head(&self) -> Result<Option<Oid>> {
    match self.repo.head() {
      Ok(head) => Ok(head.target()),
      Err(e) if matches!(e.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound) => Ok(None),
      Err(e) => Err(err(e)),
    }
  }

  fn tree_of(&self, commit: Option<Oid>) -> Result<Option<Tree<'_>>> {
    commit
      .map(|id| self.repo.find_commit(id).and_then(|c| c.tree()).map_err(err))
      .transpose()
  }

  fn signature(&self, author: &Author) -> Result<Signature<'static>> {
    Signature::now(&author.name, &author.email).map_err(err)
  }

  fn remote(&self, url: &str) -> Result<git2::Remote<'_>> {
    if self.remote_url()?.as_deref() != Some(url) {
      self.set_url(url)?;
    }
    self.repo.find_remote(REMOTE).map_err(err)
  }

  fn set_url(&self, url: &str) -> Result<()> {
    match self.repo.find_remote(REMOTE) {
      Ok(_) => self.repo.remote_set_url(REMOTE, url).map_err(err),
      Err(_) => self.repo.remote(REMOTE, url).map(|_| ()).map_err(err),
    }
  }

  /// Move the branch and the files from one commit to another. A file the
  /// new commit drops but ignores (a book no longer synced) stays on disk.
  fn move_to(&self, from: Option<Oid>, to: Oid) -> Result<Vec<String>> {
    let from_tree = self.tree_of(from)?;
    let to_tree = self.tree_of(Some(to))?.ok_or("no tree")?;
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    self.repo.checkout_tree(to_tree.as_object(), Some(&mut checkout)).map_err(err)?;
    let branch = self.branch()?;
    self
      .repo
      .reference(&format!("refs/heads/{branch}"), to, true, "mdsilo: sync")
      .map_err(err)?;

    let diff = self
      .repo
      .diff_tree_to_tree(from_tree.as_ref(), Some(&to_tree), None)
      .map_err(err)?;
    let mut changed = Vec::new();
    for delta in diff.deltas() {
      let path = delta.new_file().path().or(delta.old_file().path());
      let Some(path) = path.and_then(Path::to_str) else { continue };
      let ignored = delta.status() == git2::Delta::Deleted && self.repo.is_path_ignored(path).unwrap_or(false);
      if let (true, Some(tree)) = (ignored, &from_tree) {
        self.restore(tree, path)?;
        continue;
      }
      changed.push(path.to_string());
    }
    Ok(changed)
  }

  fn restore(&self, tree: &Tree<'_>, path: &str) -> Result<()> {
    let entry = tree.get_path(Path::new(path)).map_err(err)?;
    let blob = self.repo.find_blob(entry.id()).map_err(err)?;
    let file = self.root.join(path);
    if let Some(dir) = file.parent() {
      fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(file, blob.content()).map_err(|e| e.to_string())
  }

  fn blob(&self, entry: &Option<IndexEntry>) -> Result<Option<Vec<u8>>> {
    entry
      .as_ref()
      .map(|e| self.repo.find_blob(e.id).map(|b| b.content().to_vec()).map_err(err))
      .transpose()
  }
}

fn file_entry(path: &str, mode: u32, id: Oid, size: usize) -> IndexEntry {
  IndexEntry {
    ctime: IndexTime::new(0, 0),
    mtime: IndexTime::new(0, 0),
    dev: 0,
    ino: 0,
    mode,
    uid: 0,
    gid: 0,
    file_size: size as u32,
    id,
    flags: 0,
    flags_extended: 0,
    path: path.as_bytes().to_vec(),
  }
}

impl Repo for Git2Repo {
  fn remote_url(&self) -> Result<Option<String>> {
    match self.repo.find_remote(REMOTE) {
      Ok(remote) => Ok(remote.url().map(str::to_string)),
      Err(_) => Ok(None),
    }
  }

  fn set_remote_url(&mut self, url: &str) -> Result<()> {
    self.set_url(url)
  }

  fn author(&self) -> Result<Option<Author>> {
    let config = self.repo.config().map_err(err)?;
    let name = config.get_string("user.name").ok();
    let email = config.get_string("user.email").ok();
    Ok(name.map(|name| Author { name, email: email.unwrap_or_default() }))
  }

  fn set_author(&mut self, author: &Author) -> Result<()> {
    let config = self.repo.config().map_err(err)?;
    let mut local = config.open_level(ConfigLevel::Local).map_err(err)?;
    local.set_str("user.name", &author.name).map_err(err)?;
    local.set_str("user.email", &author.email).map_err(err)
  }

  fn branch(&self) -> Result<String> {
    let head = self.repo.find_reference("HEAD").map_err(err)?;
    head
      .symbolic_target()
      .and_then(|target| target.strip_prefix("refs/heads/"))
      .map(str::to_string)
      .ok_or_else(|| "HEAD is not on a branch".to_string())
  }

  fn has_commits(&self) -> Result<bool> {
    Ok(self.head()?.is_some())
  }

  fn set_unborn_branch(&mut self, branch: &str) -> Result<()> {
    if self.head()?.is_some() {
      return Err("the branch has commits already".into());
    }
    self.repo.set_head(&format!("refs/heads/{branch}")).map_err(err)
  }

  fn remote_default_branch(&mut self, remote: &Remote) -> Result<Option<String>> {
    let mut git_remote = self.remote(&remote.url)?;
    let head = with_credentials(&remote.url, remote.credentials.as_ref(), || {
      let connection = git_remote.connect_auth(Direction::Fetch, None, None)?;
      connection.default_branch().map(|name| name.as_str().map(str::to_string))
    });
    match head {
      Ok(name) => Ok(name.and_then(|n| n.strip_prefix("refs/heads/").map(str::to_string))),
      // an empty remote
      Err(e) if e.code() == ErrorCode::NotFound => Ok(None),
      Err(e) => Err(err(e)),
    }
  }

  fn changes(&self) -> Result<Vec<String>> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true).include_ignored(false);
    let statuses = self.repo.statuses(Some(&mut opts)).map_err(err)?;
    Ok(statuses.iter().filter_map(|s| s.path().map(str::to_string)).collect())
  }

  fn commit_all(&mut self, message: &str, author: &Author) -> Result<bool> {
    let mut index = self.repo.index().map_err(err)?;
    index.add_all(["*"], IndexAddOption::DEFAULT, None).map_err(err)?;
    index.update_all(["*"], None).map_err(err)?;
    // tracked, but ignored now (a book no longer synced): out of git, kept on disk
    let ignored: Vec<String> = index
      .iter()
      .filter_map(|e| String::from_utf8(e.path).ok())
      .filter(|path| self.repo.is_path_ignored(path).unwrap_or(false))
      .collect();
    for path in ignored {
      index.remove_path(Path::new(&path)).map_err(err)?;
    }
    index.write().map_err(err)?;
    let tree_id = index.write_tree().map_err(err)?;
    let parent = self.head()?.map(|id| self.repo.find_commit(id)).transpose().map_err(err)?;
    let tree = self.repo.find_tree(tree_id).map_err(err)?;
    let unchanged = match &parent {
      Some(parent) => parent.tree_id() == tree_id,
      None => tree.is_empty(),
    };
    if unchanged {
      return Ok(false);
    }
    let sig = self.signature(author)?;
    let parents: Vec<&git2::Commit<'_>> = parent.iter().collect();
    self
      .repo
      .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
      .map_err(err)?;
    Ok(true)
  }

  fn fetch(&mut self, remote: &Remote, branch: &str) -> Result<Option<CommitId>> {
    let tracking = format!("refs/remotes/{REMOTE}/{branch}");
    // fetched again below if the remote has it: gone if deleted there
    if let Ok(mut reference) = self.repo.find_reference(&tracking) {
      reference.delete().map_err(err)?;
    }
    let mut git_remote = self.remote(&remote.url)?;
    let refspec = format!("+refs/heads/{branch}:{tracking}");
    let mut opts = FetchOptions::new();
    opts.download_tags(AutotagOption::None);
    with_credentials(&remote.url, remote.credentials.as_ref(), || {
      git_remote.fetch(&[&refspec], Some(&mut opts), None)
    })
    .map_err(err)?;
    match self.repo.refname_to_id(&tracking) {
      Ok(id) => Ok(Some(id.to_string())),
      Err(e) if e.code() == ErrorCode::NotFound => Ok(None),
      Err(e) => Err(err(e)),
    }
  }

  fn relation(&self, theirs: &CommitId) -> Result<Relation> {
    let theirs = Oid::from_str(theirs).map_err(err)?;
    let Some(ours) = self.head()? else {
      return Ok(Relation::Behind);
    };
    if ours == theirs {
      Ok(Relation::UpToDate)
    } else if self.repo.graph_descendant_of(ours, theirs).map_err(err)? {
      Ok(Relation::Ahead)
    } else if self.repo.graph_descendant_of(theirs, ours).map_err(err)? {
      Ok(Relation::Behind)
    } else {
      Ok(Relation::Diverged)
    }
  }

  fn fast_forward(&mut self, to: &CommitId) -> Result<Vec<String>> {
    let to = Oid::from_str(to).map_err(err)?;
    self.move_to(self.head()?, to)
  }

  fn merge(
    &mut self,
    theirs: &CommitId,
    resolve: &mut dyn FnMut(&Conflict) -> Resolved,
    message: &str,
    author: &Author,
  ) -> Result<Merged> {
    let ours_id = self.head()?.ok_or("nothing to merge into")?;
    let ours = self.repo.find_commit(ours_id).map_err(err)?;
    let theirs = self.repo.find_commit(Oid::from_str(theirs).map_err(err)?).map_err(err)?;
    let base_tree = match self.repo.merge_base(ours.id(), theirs.id()) {
      Ok(base) => self.repo.find_commit(base).and_then(|c| c.tree()).map_err(err)?,
      // unrelated histories, e.g. a workspace started on two devices
      Err(e) if e.code() == ErrorCode::NotFound => {
        let empty = self.repo.treebuilder(None).and_then(|b| b.write()).map_err(err)?;
        self.repo.find_tree(empty).map_err(err)?
      }
      Err(e) => return Err(err(e)),
    };
    let ours_tree = ours.tree().map_err(err)?;
    let theirs_tree = theirs.tree().map_err(err)?;
    let mut index = self
      .repo
      .merge_trees(&base_tree, &ours_tree, &theirs_tree, None)
      .map_err(err)?;

    let mut conflicts = Vec::new();
    if index.has_conflicts() {
      let found = index
        .conflicts()
        .map_err(err)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(err)?;
      for found in found {
        let Some(entry) = found.our.as_ref().or(found.their.as_ref()).or(found.ancestor.as_ref()) else {
          continue;
        };
        let path = String::from_utf8_lossy(&entry.path).into_owned();
        let mode = entry.mode;
        let conflict = Conflict {
          path: path.clone(),
          base: self.blob(&found.ancestor)?,
          ours: self.blob(&found.our)?,
          theirs: self.blob(&found.their)?,
        };
        let resolved = resolve(&conflict);
        index.conflict_remove(Path::new(&path)).map_err(err)?;
        for (file, data) in &resolved.writes {
          match data {
            Some(data) => {
              // the merged index is in memory: the blob first, then its entry
              let id = self.repo.blob(data).map_err(err)?;
              index.add(&file_entry(file, mode, id, data.len())).map_err(err)?;
            }
            None => {
              let _ = index.remove_path(Path::new(file));
            }
          }
        }
        conflicts.push((path, resolved));
      }
    }

    let tree_id = index.write_tree_to(&self.repo).map_err(err)?;
    let tree = self.repo.find_tree(tree_id).map_err(err)?;
    let sig = self.signature(author)?;
    let merged = self
      .repo
      .commit(None, &sig, &sig, message, &tree, &[&ours, &theirs])
      .map_err(err)?;
    let changed = self.move_to(Some(ours_id), merged)?;
    Ok(Merged { changed, conflicts })
  }

  fn push(&mut self, remote: &Remote, branch: &str) -> Result<bool> {
    if self.head()?.is_none() {
      return Ok(true); // nothing to push
    }
    let mut git_remote = self.remote(&remote.url)?;
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    let rejected = RefCell::new(None::<String>);
    let mut callbacks = RemoteCallbacks::new();
    callbacks.push_update_reference(|_, status| {
      if let Some(status) = status {
        *rejected.borrow_mut() = Some(status.to_string());
      }
      Ok(())
    });
    let mut opts = PushOptions::new();
    opts.remote_callbacks(callbacks);
    let result = with_credentials(&remote.url, remote.credentials.as_ref(), || {
      git_remote.push(&[&refspec], Some(&mut opts))
    });
    drop(opts);
    match result {
      Ok(()) => match rejected.into_inner() {
        None => Ok(true),
        // the remote moved on since the fetch
        Some(status) if ["fast-forward", "fetch first", "stale"].iter().any(|s| status.contains(s)) => Ok(false),
        Some(status) => Err(format!("the remote refused the push: {status}")),
      },
      Err(e) if e.code() == ErrorCode::NotFastForward => Ok(false),
      Err(e) => Err(err(e)),
    }
  }
}
