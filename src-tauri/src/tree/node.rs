use ignore::DirEntry;
use indextree::{Arena, Node as NodeWrapper, NodeId};
use std::{
  borrow::Cow,
  convert::{From, Into},
  ffi::{OsStr, OsString},
  fs::{FileType, Metadata},
  path::{Path, PathBuf}, 
  time::SystemTime,
};
use crate::{paths::PathExt, files::check_hidden};
use crate::files::SimpleFileMeta;

#[derive(Debug, Clone)]
pub struct Node {
  pub depth: usize,
  file_name: OsString,
  file_type: Option<FileType>,
  pub file_meta: Option<Metadata>,
  path: PathBuf,
}

impl Node {
  /// Initializes a new [Node].
  pub fn new(
    depth: usize,
    file_name: OsString,
    file_type: Option<FileType>,
    file_meta: Option<Metadata>,
    path: PathBuf,
  ) -> Self {
    Self {
      depth,
      file_name,
      file_type,
      file_meta,
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
    
    Self::new(
      depth, 
      file_name, 
      file_type, 
      metadata,
      path.into()
    )
  }
}

impl From<(NodeId, &mut Arena<Self>)> for &Node {
  fn from((node_id, tree): (NodeId, &mut Arena<Self>)) -> Self {
    tree.get(node_id).map(NodeWrapper::get).unwrap()
  }
}


pub fn from_node(node: &Node) -> Option<SimpleFileMeta> {
  let metadata =  match node.file_meta.clone() {
    Some(meta) => meta,
    None => return None,
  };
  
  let now = SystemTime::now();
  let created = metadata.created().unwrap_or(now);
  let last_modified = metadata.modified().unwrap_or(now);
  let last_accessed = metadata.accessed().unwrap_or(now);

  let normalized_path = match node.path().normalize_slash() {
    Some(normalized) => normalized,
    None => return None,
  };
  let is_hidden = check_hidden(&normalized_path);
  
  let data = SimpleFileMeta {
    file_path: normalized_path,
    file_name: node.file_name_lossy().to_string(),
    // file_type,
    created,
    last_modified,
    last_accessed,
    size: metadata.len(),
    readonly: metadata.permissions().readonly(),
    is_dir: metadata.is_dir(),
    is_file: metadata.is_file(),
    is_hidden,
  };

  Some(data)
}
