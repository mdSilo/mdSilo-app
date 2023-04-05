use ignore::DirEntry;
use indextree::{Arena, Node as NodeWrapper, NodeId};
use std::{
  borrow::Cow,
  convert::From,
  ffi::{OsStr, OsString},
  fs::{FileType, Metadata},
  path::{Path, PathBuf}, 
  // time::SystemTime,
};

#[derive(Debug)]
pub struct Node {
  pub depth: usize,
  file_name: OsString,
  file_type: Option<FileType>,
  pub file_meta: Option<Metadata>,
  // pub file_size: u64,
  // pub created: SystemTime,
  // pub last_modified: SystemTime,
  // pub last_accessed: SystemTime,
  path: PathBuf,
}

impl Node {
  /// Initializes a new [Node].
  pub fn new(
    depth: usize,
    file_name: OsString,
    file_type: Option<FileType>,
    file_meta: Option<Metadata>,
    // file_size: u64,
    // created: SystemTime,
    // last_modified: SystemTime,
    // last_accessed: SystemTime,
    path: PathBuf,
  ) -> Self {
    Self {
      depth,
      file_name,
      file_type,
      file_meta,
      // file_size,
      // created,
      // last_modified,
      // last_accessed,
      path,
    }
  }

  pub fn file_name(&self) -> &OsStr {
    &self.file_name
  }

  /// Converts `OsStr` to `String`; if fails does a lossy conversion 
  pub fn file_name_lossy(&self) -> Cow<'_, str> {
    self
      .file_name()
      .to_str()
      .map_or_else(|| self.file_name().to_string_lossy(), Cow::from)
  }

  pub fn is_dir(&self) -> bool {
    self.file_type().map(|ft| ft.is_dir()).unwrap_or(false)
  }

  pub fn file_type(&self) -> Option<&FileType> {
    self.file_type.as_ref()
  }

  pub fn parent_path(&self) -> Option<&Path> {
    self.path.parent()
  }

  pub fn path(&self) -> &Path {
    &self.path
  }
}

impl From<&DirEntry> for Node {
  fn from(dir_entry: &DirEntry) -> Self {

    let depth = dir_entry.depth();

    let file_type = dir_entry.file_type();

    let path = dir_entry.path();

    let file_name = path.file_name().map_or_else(
      || OsString::from(path.display().to_string()),
      |os_str| os_str.to_owned(),
    );

    let metadata = dir_entry.metadata().ok();
    
    // let file_size = metadata.clone().map(|md|md.len()).unwrap_or(0);
    // let now = SystemTime::now();
    // let created = metadata.clone()
    //   .map(|md|md.created().unwrap_or(now))
    //   .unwrap_or(now);
    // let last_modified = metadata.clone()
    //   .map(|md|md.modified().unwrap_or(now))
    //   .unwrap_or(now);
    // let last_accessed = metadata.clone()
    //   .map(|md|md.accessed().unwrap_or(now))
    //   .unwrap_or(now);

    // let inode = metadata.clone().map(Inode::try_from).transpose().ok().flatten();

    Self::new(
      depth, 
      file_name, 
      file_type, 
      metadata,
      // file_size, 
      // created, 
      // last_modified, 
      // last_accessed, 
      path.into()
    )
  }
}

impl From<(NodeId, &mut Arena<Self>)> for &Node {
  fn from((node_id, tree): (NodeId, &mut Arena<Self>)) -> Self {
    tree.get(node_id).map(NodeWrapper::get).unwrap()
  }
}
