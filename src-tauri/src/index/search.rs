//! Full-text search of a workspace (tantivy): the notes, and the text of the
//! books read. Words are cut by jieba, so Chinese is searched by word too.

use std::path::Path;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::{
  Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, STORED, STRING,
};
use tantivy::snippet::SnippetGenerator;
use tantivy::tokenizer::{LowerCaser, RemoveLongFilter, TextAnalyzer};
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term};

/// Bump on a change of the schema: the index is made anew.
const SCHEMA_VERSION: &str = "1";
const TOKENIZER: &str = "jieba";
const WRITER_HEAP: usize = 30_000_000;

#[derive(Clone, Copy)]
struct Fields {
  /// the note path (relative), or `book:<hash>#<cfi>` of a section
  id: Field,
  /// `note` or `book`
  kind: Field,
  title: Field,
  /// the chapter of a book section
  label: Field,
  body: Field,
}

/// A document found.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct Hit {
  pub id: String,
  pub kind: String,
  pub title: String,
  pub label: String,
  /// the text around the words found, the words in `<b>`, HTML escaped
  pub snippet: String,
  pub score: f32,
}

/// A document to index.
pub struct Doc<'a> {
  pub id: &'a str,
  pub kind: &'a str,
  pub title: &'a str,
  pub label: &'a str,
  pub body: &'a str,
}

pub struct SearchIndex {
  index: Index,
  reader: IndexReader,
  writer: IndexWriter,
  fields: Fields,
  dirty: bool,
}

fn schema() -> (Schema, Fields) {
  let mut builder = Schema::builder();
  let text = TextOptions::default()
    .set_indexing_options(
      TextFieldIndexing::default()
        .set_tokenizer(TOKENIZER)
        .set_index_option(IndexRecordOption::WithFreqsAndPositions),
    )
    .set_stored();
  let fields = Fields {
    id: builder.add_text_field("id", STRING | STORED),
    kind: builder.add_text_field("kind", STRING | STORED),
    title: builder.add_text_field("title", text.clone()),
    label: builder.add_text_field("label", STORED),
    body: builder.add_text_field("body", text),
  };
  (builder.build(), fields)
}

fn analyzer() -> TextAnalyzer {
  TextAnalyzer::builder(tantivy_jieba::JiebaTokenizer::new())
    .filter(RemoveLongFilter::limit(40))
    .filter(LowerCaser)
    .build()
}

impl SearchIndex {
  /// Open the index in the dir, made anew if of another version or broken.
  pub fn open(dir: &Path) -> Result<Self, String> {
    let version_file = dir.join("VERSION");
    let same = std::fs::read_to_string(&version_file).is_ok_and(|v| v.trim() == SCHEMA_VERSION);
    let (schema, fields) = schema();
    let open = || -> tantivy::Result<Index> {
      std::fs::create_dir_all(dir)?;
      Index::open_or_create(tantivy::directory::MmapDirectory::open(dir)?, schema.clone())
    };
    let index = match (same, open()) {
      (true, Ok(index)) => index,
      _ => {
        let _ = std::fs::remove_dir_all(dir);
        let index = open().map_err(|e| e.to_string())?;
        std::fs::write(&version_file, SCHEMA_VERSION).map_err(|e| e.to_string())?;
        index
      }
    };
    index.tokenizers().register(TOKENIZER, analyzer());
    let reader = index
      .reader_builder()
      .reload_policy(ReloadPolicy::Manual)
      .try_into()
      .map_err(|e: tantivy::TantivyError| e.to_string())?;
    let writer = index.writer(WRITER_HEAP).map_err(|e| e.to_string())?;
    Ok(Self { index, reader, writer, fields, dirty: false })
  }

  /// Index the document, replacing the one of its id.
  pub fn put(&mut self, d: Doc) -> Result<(), String> {
    let f = self.fields;
    self.writer.delete_term(Term::from_field_text(f.id, d.id));
    self
      .writer
      .add_document(doc!(f.id => d.id, f.kind => d.kind, f.title => d.title, f.label => d.label, f.body => d.body))
      .map_err(|e| e.to_string())?;
    self.dirty = true;
    Ok(())
  }

  pub fn delete(&mut self, id: &str) {
    self.writer.delete_term(Term::from_field_text(self.fields.id, id));
    self.dirty = true;
  }

  /// Delete the documents whose id starts with the prefix, e.g. of a book.
  pub fn delete_prefix(&mut self, prefix: &str) -> Result<(), String> {
    for id in self.ids()?.into_iter().filter(|id| id.starts_with(prefix)) {
      self.delete(&id);
    }
    Ok(())
  }

  /// Make the changes searchable.
  pub fn commit(&mut self) -> Result<(), String> {
    if !self.dirty {
      return Ok(());
    }
    self.writer.commit().map_err(|e| e.to_string())?;
    self.reader.reload().map_err(|e| e.to_string())?;
    self.dirty = false;
    Ok(())
  }

  /// The ids of all the documents.
  pub fn ids(&self) -> Result<Vec<String>, String> {
    let searcher = self.reader.searcher();
    let mut ids = Vec::new();
    for segment in searcher.segment_readers() {
      let store = segment.get_store_reader(1).map_err(|e| e.to_string())?;
      for doc_id in segment.doc_ids_alive() {
        let doc: TantivyDocument = store.get(doc_id).map_err(|e| e.to_string())?;
        if let Some(id) = doc.get_first(self.fields.id).and_then(|v| v.as_str()) {
          ids.push(id.to_string());
        }
      }
    }
    Ok(ids)
  }

  /// The documents matching the query (all the words; `"..."` a phrase),
  /// of a kind or any, best first.
  pub fn search(&self, query: &str, kind: Option<&str>, limit: usize) -> Result<Vec<Hit>, String> {
    let f = self.fields;
    let mut parser = QueryParser::for_index(&self.index, vec![f.title, f.body]);
    parser.set_conjunction_by_default();
    parser.set_field_boost(f.title, 2.0);
    let (text_query, _errors) = parser.parse_query_lenient(query);
    let searcher = self.reader.searcher();
    let mut snippets = SnippetGenerator::create(&searcher, &*text_query, f.body).map_err(|e| e.to_string())?;
    snippets.set_max_num_chars(160);
    // more than the limit: the documents of another kind are skipped
    let wanted = if kind.is_some() { limit * 4 } else { limit };
    let top = searcher
      .search(&*text_query, &TopDocs::with_limit(wanted.max(1)).order_by_score())
      .map_err(|e| e.to_string())?;
    let mut hits = Vec::new();
    for (score, address) in top {
      let doc: TantivyDocument = searcher.doc(address).map_err(|e| e.to_string())?;
      let text = |field: Field| doc.get_first(field).and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let doc_kind = text(f.kind);
      if kind.is_some_and(|k| k != doc_kind) {
        continue;
      }
      let snippet = snippets.snippet_from_doc(&doc);
      hits.push(Hit {
        id: text(f.id),
        kind: doc_kind,
        title: text(f.title),
        label: text(f.label),
        snippet: snippet.to_html(),
        score,
      });
      if hits.len() >= limit {
        break;
      }
    }
    Ok(hits)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn searches_the_notes_and_books() {
    let dir = std::env::temp_dir().join(format!("mdsilo-search-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let mut index = SearchIndex::open(&dir).unwrap();
    let note = |id, title, body| Doc { id, kind: "note", title, label: "", body };
    index.put(note("a.md", "Rust notes", "Ownership and borrowing in Rust.")).unwrap();
    index.put(note("b.md", "中文笔记", "我们今天学习全文搜索和分词。")).unwrap();
    index.put(Doc { id: "book:x#/6/4", kind: "book", title: "A Book", label: "One", body: "Borrowing money from a friend." }).unwrap();
    index.commit().unwrap();

    let hits = index.search("borrowing", None, 10).unwrap();
    assert_eq!(hits.len(), 2);
    assert!(hits.iter().any(|h| h.id == "a.md" && h.snippet.contains("<b>borrowing</b>")));
    let books = index.search("borrowing", Some("book"), 10).unwrap();
    assert_eq!(books.iter().map(|h| (h.id.as_str(), h.label.as_str())).collect::<Vec<_>>(), [("book:x#/6/4", "One")]);
    // by word, in Chinese
    assert_eq!(index.search("搜索", None, 10).unwrap()[0].id, "b.md");
    // the title counts
    assert_eq!(index.search("rust", None, 10).unwrap()[0].id, "a.md");
    // all the words
    assert!(index.search("rust money", None, 10).unwrap().is_empty());

    // replaced, deleted
    index.put(note("a.md", "Rust notes", "Lifetimes only.")).unwrap();
    index.delete_prefix("book:x").unwrap();
    index.commit().unwrap();
    assert!(index.search("borrowing", None, 10).unwrap().is_empty());
    assert_eq!(index.ids().unwrap().len(), 2);
    drop(index);

    // reopened as it was
    let index = SearchIndex::open(&dir).unwrap();
    assert_eq!(index.search("lifetimes", None, 10).unwrap().len(), 1);
    drop(index);
    std::fs::remove_dir_all(&dir).unwrap();
  }
}
