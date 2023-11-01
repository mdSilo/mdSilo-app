use chrono::{SecondsFormat, TimeZone, Utc};
use crossbeam::channel::{self, Sender};
use ignore::{WalkBuilder, WalkParallel};
use indextree::{Arena, NodeId};
use std::{
  collections::HashMap,
  convert::From,
  fs,
  num::NonZeroUsize,
  path::{Path, PathBuf},
  thread::{self, available_parallelism},
  time::UNIX_EPOCH,
};

use node::Node;
use visitor::{BranchVisitorBuilder, TraversalState};

use crate::json::{NoteData, NoteTree, NoteTreeItem, NotesData};

use self::node::from_node;

pub mod node;
pub mod visitor;

/// Virtual data structure that represents file hierarchy.
#[derive(Debug)]
pub struct Tree {
  inner: Arena<Node>,
  pub root: NodeId,
}

pub type TreeResult<T> = Result<T, String>;

impl Tree {
  /// Constructor for [Tree].
  pub fn new(inner: Arena<Node>, root: NodeId) -> Self {
    Self { inner, root }
  }

  // Initiates file system traversal and Tree construction.
  //　dir: root dir;
  // depth: maximum depth to recurse, None as no restriction;
  // read_ctn: if read the content of file
  pub fn init(dir: &str, depth: Option<usize>, read_ctn: bool) -> TreeResult<Self> {
    let (inner, root) = Self::traverse(dir, depth, read_ctn)?;

    Ok(Self::new(inner, root))
  }

  // Grabs a reference to `inner`.
  pub fn inner(&self) -> &Arena<Node> {
    &self.inner
  }

  // Parallel traversal of the directory
  fn traverse(
    dir: &str,
    depth: Option<usize>,
    read_ctn: bool,
  ) -> TreeResult<(Arena<Node>, NodeId)> {
    let walker = new_walker(PathBuf::from(dir), depth)?;
    let (tx, rx) = channel::unbounded::<TraversalState>();
    
    thread::scope(|s| {
      let mut tree = Arena::new();

      let res = s.spawn(|| {
        // Key represents path of parent directory and values represent children.
        let mut branches: HashMap<PathBuf, Vec<NodeId>> = HashMap::new();
        let mut root_id = None;

        while let Ok(TraversalState::Ongoing(node)) = rx.recv() {
          if node.is_dir() {
            let node_path = node.path();

            if !branches.contains_key(node_path) {
              branches.insert(node_path.to_owned(), vec![]);
            }

            if node.depth == 0 {
              root_id = Some(tree.new_node(node));
              continue;
            }
          }

          let parent = node
            .parent_path()
            .ok_or(String::from("ExpectedParent"))?
            .to_owned();
          let node_id = tree.new_node(node);

          if let None = branches
            .get_mut(&parent)
            .map(|mut_ref| mut_ref.push(node_id))
          {
            branches.insert(parent, vec![]);
          }
        }

        let root = root_id.ok_or(String::from("MissingRoot"))?;

        Self::assemble_tree(&mut tree, root, &mut branches);

        Ok::<(Arena<Node>, NodeId), String>((tree, root))
      });

      let mut visitor_builder =
        BranchVisitorBuilder::new(Sender::clone(&tx), read_ctn);

      walker.visit(&mut visitor_builder);

      tx.send(TraversalState::Done).unwrap_or(());

      res.join().unwrap()
    })
  }

  // Takes the results of the parallel traversal and uses it to construct the tree
  fn assemble_tree(
    tree: &mut Arena<Node>,
    current_node_id: NodeId,
    branches: &mut HashMap<PathBuf, Vec<NodeId>>,
  ) {
    let current_node = tree[current_node_id].get_mut();

    let children = branches.remove(current_node.path()).unwrap_or_default();
    for child_id in children.iter() {
      let index = *child_id;

      let is_dir = {
        let inner = tree[index].get();
        inner.is_dir()
      };

      if is_dir {
        Self::assemble_tree(tree, index, branches);
      }
    }

    // Append children to current node.
    for child_id in children {
      current_node_id.append(child_id, tree);
    }
  }

  pub fn children_vec(&self) -> Vec<Node> {
    let root = self.root;
    let inner = self.inner();

    let mut children = root.children(inner);
    let mut res: Vec<Node> = Vec::new();

    while let Some(current_node_id) = children.next() {
      let node = inner[current_node_id].get().clone();
      res.push(node);
    }

    res
  }
}

// Build a new Parallel walker
fn new_walker(dir: PathBuf, depth: Option<usize>) -> Result<WalkParallel, String> {
  let root = fs::canonicalize(dir).map_err(|e| (format!("{e}")))?;

  fs::metadata(&root).map_err(|e| (format!("Not Found {}: {e}", root.display())))?;

  Ok(
    WalkBuilder::new(root)
      .max_depth(depth)
      .follow_links(false)
      .git_ignore(false)
      .hidden(true)
      .threads(default_threads_num())
      .build_parallel(),
  )
}

// default amount of parallelism
fn default_threads_num() -> usize {
  available_parallelism()
    .unwrap_or_else(|_| NonZeroUsize::new(1).unwrap())
    .get()
}

pub fn assemble_note_tree(
  root: NodeId,
  inner: &Arena<Node>,
  notes: &mut NotesData,
  note_tree: &mut NoteTree,
) {
  // println!(">> now is the dir: {:?}, node is {:?}", root, inner[root].get());
  let mut children = root.children(inner);
  let mut tree_items = Vec::new();
  while let Some(child_node_id) = children.next() {
    let child = inner[child_node_id].get().clone();

    if let Some(file) = from_node(&child) {
      let fname = file.file_name.clone();
      let is_dir = file.is_dir;
      let file_path = file.file_path.clone();

      let file_title = Path::new(&fname)
        .file_stem()
        .unwrap_or_default()
        .to_owned()
        .into_string()
        .unwrap_or_default();

      let mod_since_the_epoch = file
        .last_modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
      let last_mod_date = Utc
        .timestamp_millis_opt(mod_since_the_epoch as i64)
        .earliest()
        .unwrap_or_else(|| Utc::now())
        .to_rfc3339_opts(SecondsFormat::Millis, true);

      let create_since_the_epoch = file
        .created
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
      let created_date = Utc
        .timestamp_millis_opt(create_since_the_epoch as i64)
        .earliest()
        .unwrap_or_else(|| Utc::now())
        .to_rfc3339_opts(SecondsFormat::Millis, true);

      let new_note = NoteData {
        id: file_path.clone(),
        title: file_title.clone(),
        content: if is_dir {
          String::new()
        } else {
          file.file_text
        },
        created_at: created_date.clone(),
        updated_at: last_mod_date.clone(),
        file_path: file_path.clone(),
        is_dir,
        ..NoteData::default()
      };
      notes.insert(file_path.clone(), new_note);

      let new_tree = NoteTreeItem {
        id: file_path,
        title: file_title,
        created_at: created_date,
        updated_at: last_mod_date,
        is_dir,
      };

      tree_items.push(new_tree);
    }

    if child.is_dir() {
      assemble_note_tree(child_node_id, inner, notes, note_tree);
    }
  }

  let root_node = inner[root].get().clone();
  if let Some(root_file) = from_node(&root_node) {
    tree_items.sort_by(|a, b| (a.id).cmp(&b.id));
    tree_items.dedup_by(|a, b| a.id == b.id);
    note_tree.insert(root_file.file_path, tree_items);
  }
}
