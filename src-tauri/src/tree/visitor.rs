use super::Node;
use crossbeam::channel::Sender;
use ignore::{
  DirEntry, Error as IgnoreError, ParallelVisitor, ParallelVisitorBuilder, WalkState,
};

pub enum TraversalState {
  Ongoing(Node),
  Done,
}

pub struct BranchVisitor {
  tx: Sender<TraversalState>,
}

pub struct BranchVisitorBuilder {
  tx: Sender<TraversalState>,
}

impl BranchVisitorBuilder {
  pub fn new(tx: Sender<TraversalState>) -> Self {
    Self { tx }
  }
}

impl BranchVisitor {
  pub fn new(tx: Sender<TraversalState>) -> Self {
    Self { tx }
  }
}

impl From<Node> for TraversalState {
  fn from(node: Node) -> Self {
    TraversalState::Ongoing(node)
  }
}

impl ParallelVisitor for BranchVisitor {
  fn visit(&mut self, entry: Result<DirEntry, IgnoreError>) -> WalkState {
    entry
      .map(|e| TraversalState::from(Node::from(&e)))
      .map(|n| self.tx.send(n).unwrap())
      .map(|_| WalkState::Continue)
      .unwrap_or(WalkState::Skip)
  }
}

impl<'s> ParallelVisitorBuilder<'s> for BranchVisitorBuilder {
  fn build(&mut self) -> Box<dyn ParallelVisitor + 's> {
    let visitor = BranchVisitor::new(self.tx.clone());
    Box::new(visitor)
  }
}
