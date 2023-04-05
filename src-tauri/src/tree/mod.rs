use crossbeam::channel::{self, Sender};
use ignore::{WalkBuilder, WalkParallel};
use indextree::{Arena, NodeId};
use std::{
  collections::HashMap,
  fs,
  path::PathBuf,
  thread::{self, available_parallelism}, 
  num::NonZeroUsize,
  convert::From,
};

use node::Node;
use visitor::{BranchVisitorBuilder, TraversalState};

pub mod node;
pub mod visitor;

/// Virtual data structure that represents file hierarchy.
#[derive(Debug)]
pub struct Tree {
  inner: Arena<Node>,
  root: NodeId,
}

pub type TreeResult<T> = Result<T, String>;

impl Tree {
  /// Constructor for [Tree].
  pub fn new(inner: Arena<Node>, root: NodeId) -> Self {
    Self { inner, root }
  }

  /// Initiates file-system traversal and [Tree construction].
  pub fn init(dir: &str) -> TreeResult<Self> {
    let (inner, root) = Self::traverse(dir)?;

    Ok(Self::new(inner, root))
  }

  /// Parallel traversal of the directory 
  fn traverse(dir: &str) -> TreeResult<(Arena<Node>, NodeId)> {
    let walker = new_walker(PathBuf::from(dir))?;
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

          let parent = node.parent_path().ok_or(String::from("ExpectedParent"))?.to_owned();

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

      let mut visitor_builder = BranchVisitorBuilder::new(Sender::clone(&tx));

      walker.visit(&mut visitor_builder);

      tx.send(TraversalState::Done).unwrap();

      res.join().unwrap()
    })
  }

  /// Takes the results of the parallel traversal and uses it to construct the tree
  fn assemble_tree(
    tree: &mut Arena<Node>,
    current_node_id: NodeId,
    branches: &mut HashMap<PathBuf, Vec<NodeId>>,
  ) {
    let current_node = tree[current_node_id].get_mut();

    let children = branches.remove(current_node.path()).unwrap();
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
}

/// Build a new Parallel walker
fn new_walker(dir: PathBuf) -> Result<WalkParallel, String> {
  let root = fs::canonicalize(dir).map_err(|e| (format!("{e}")))?;

  fs::metadata(&root)
    .map_err(|e| (format!("{}: {e}", root.display())))?;

  Ok(
    WalkBuilder::new(root)
      .max_depth(Some(1))
      .follow_links(false)
      .git_ignore(false)
      .hidden(true)
      .threads(default_threads_num())
      .build_parallel(),
  )
}

/// default amount of parallelism 
fn default_threads_num() -> usize {
  available_parallelism()
    .unwrap_or_else(|_| NonZeroUsize::new(1).unwrap())
    .get()
}
