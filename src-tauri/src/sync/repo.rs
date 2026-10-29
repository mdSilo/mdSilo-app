//! The git operations the sync needs, behind one trait: the sync (mod.rs) and
//! the conflicts (resolve.rs) do not know the git library; git2_repo.rs is
//! the one implementation, another library would be another.

use super::http::Credentials;
use super::resolve::{Conflict, Resolved};

pub type Result<T> = std::result::Result<T, String>;

/// A commit, by its hex id.
pub type CommitId = String;

#[derive(Debug, Clone)]
pub struct Remote {
  pub url: String,
  pub credentials: Option<Credentials>,
}

#[derive(Debug, Clone)]
pub struct Author {
  pub name: String,
  pub email: String,
}

/// Where the local branch is, from the remote one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Relation {
  UpToDate,
  /// local commits to push
  Ahead,
  /// remote commits to take
  Behind,
  Diverged,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Merged {
  /// the files changed in the workspace, relative, with `/`
  pub changed: Vec<String>,
  /// the conflicts, as resolved
  pub conflicts: Vec<(String, Resolved)>,
}

pub trait Repo: Send {
  /// The URL of the remote synced with, if set.
  fn remote_url(&self) -> Result<Option<String>>;
  fn set_remote_url(&mut self, url: &str) -> Result<()>;
  /// The author of the commits, as configured, if any.
  fn author(&self) -> Result<Option<Author>>;
  /// Set the author for this workspace only.
  fn set_author(&mut self, author: &Author) -> Result<()>;
  /// The local branch, e.g. `main`, also before the first commit.
  fn branch(&self) -> Result<String>;
  /// The branch has a commit yet.
  fn has_commits(&self) -> Result<bool>;
  /// Put the branch to come on another name, before the first commit.
  fn set_unborn_branch(&mut self, branch: &str) -> Result<()>;
  /// The branch the remote's HEAD names, e.g. `master`; None if empty.
  fn remote_default_branch(&mut self, remote: &Remote) -> Result<Option<String>>;
  /// The files changed and not committed, relative, with `/`.
  fn changes(&self) -> Result<Vec<String>>;
  /// Commit every change but the ignored files; false if nothing changed.
  fn commit_all(&mut self, message: &str, author: &Author) -> Result<bool>;
  /// Fetch the branch; its commit on the remote, None if it has none.
  fn fetch(&mut self, remote: &Remote, branch: &str) -> Result<Option<CommitId>>;
  fn relation(&self, theirs: &CommitId) -> Result<Relation>;
  /// Move the branch to a commit after it, the files with it.
  fn fast_forward(&mut self, to: &CommitId) -> Result<Vec<String>>;
  /// Merge a commit into the branch, the conflicts resolved by `resolve`,
  /// and commit; the files follow.
  fn merge(
    &mut self,
    theirs: &CommitId,
    resolve: &mut dyn FnMut(&Conflict) -> Resolved,
    message: &str,
    author: &Author,
  ) -> Result<Merged>;
  /// Push the branch; false if the remote has moved on (fetch again).
  fn push(&mut self, remote: &Remote, branch: &str) -> Result<bool>;
}
