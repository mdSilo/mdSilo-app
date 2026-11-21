//! AI providers (B6, see docs/ai.md): the services and local servers of
//! language models the user set up, an OpenAI-compatible API (OpenAI, Ollama,
//! LM Studio, llama.cpp, OpenRouter…) or Anthropic's.
//!
//! The requests and the answers are made and read in the frontend
//! (src/ai/protocol.ts), the same on desktop and web; here the request is only
//! sent, with the key of the provider, to the address of the provider: the key
//! never goes to the frontend, and cannot be sent anywhere else.
//!
//! The providers, with their keys, are kept in the app's data dir, never in
//! the workspace, as the settings of the speech engines.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;

use crate::atomic::write_atomic;

pub(crate) type Result<T> = std::result::Result<T, String>;

/// A provider as kept, with its key.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
  pub id: String,
  /// "openai" (any OpenAI-compatible API) or "anthropic"
  pub kind: String,
  pub label: String,
  /// e.g. https://api.openai.com/v1, http://localhost:11434/v1
  pub base_url: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub key: Option<String>,
  /// the models, tokens…: kept for the frontend, not read here
  #[serde(default)]
  pub settings: serde_json::Value,
}

/// A provider as shown to the frontend: whether it has a key, not the key.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShownProvider {
  pub id: String,
  pub kind: String,
  pub label: String,
  pub base_url: String,
  pub has_key: bool,
  pub settings: serde_json::Value,
}

impl From<&Provider> for ShownProvider {
  fn from(p: &Provider) -> Self {
    ShownProvider {
      id: p.id.clone(),
      kind: p.kind.clone(),
      label: p.label.clone(),
      base_url: p.base_url.clone(),
      has_key: p.key.as_deref().is_some_and(|k| !k.is_empty()),
      settings: p.settings.clone(),
    }
  }
}

/// A provider to save: `key` none keeps the key saved, empty forgets it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInput {
  pub id: String,
  pub kind: String,
  pub label: String,
  pub base_url: String,
  pub key: Option<String>,
  #[serde(default)]
  pub settings: serde_json::Value,
}

const KINDS: [&str; 2] = ["openai", "anthropic"];
const ANTHROPIC_VERSION: &str = "2023-06-01";

// the providers, in a file of the data dir

fn config_file() -> Result<PathBuf> {
  crate::storage::data_dir()
    .map(|dir| dir.join("ai-config.json"))
    .ok_or_else(|| "No data dir for the AI settings".into())
}

fn read_providers(file: &Path) -> Vec<Provider> {
  std::fs::read(file)
    .ok()
    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    .unwrap_or_default()
}

fn write_providers(file: &Path, providers: &[Provider]) -> Result<()> {
  let data = serde_json::to_vec_pretty(providers).map_err(|e| e.to_string())?;
  write_atomic(file, &data).map_err(|e| e.to_string())?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600));
  }
  Ok(())
}

/// The base URL, checked: http(s), no query, no trailing slash.
fn checked_base(url: &str) -> Result<String> {
  let url = url.trim().trim_end_matches('/');
  let parsed =
    url::Url::parse(url).map_err(|e| format!("Bad address {url}: {e}"))?;
  if !matches!(parsed.scheme(), "http" | "https") {
    return Err(format!("Not an http(s) address: {url}"));
  }
  if parsed.query().is_some() || parsed.fragment().is_some() {
    return Err(format!("The address has a query: {url}"));
  }
  Ok(url.to_string())
}

/// Save a provider, new or changed.
fn save_provider(file: &Path, input: ProviderInput) -> Result<ShownProvider> {
  let id = input.id.trim();
  if id.is_empty() || id.len() > 64 {
    return Err("A provider needs an id".into());
  }
  if !KINDS.contains(&input.kind.as_str()) {
    return Err(format!("No provider kind {}", input.kind));
  }
  let base_url = checked_base(&input.base_url)?;
  let mut providers = read_providers(file);
  let old_key = providers
    .iter()
    .find(|p| p.id == id)
    .and_then(|p| p.key.clone());
  let key = match input.key.map(|k| k.trim().to_string()) {
    None => old_key,
    Some(k) if k.is_empty() => None,
    Some(k) => Some(k),
  };
  let provider = Provider {
    id: id.to_string(),
    kind: input.kind,
    label: input.label.trim().to_string(),
    base_url,
    key,
    settings: input.settings,
  };
  let shown = ShownProvider::from(&provider);
  match providers.iter_mut().find(|p| p.id == provider.id) {
    Some(p) => *p = provider,
    None => providers.push(provider),
  }
  write_providers(file, &providers)?;
  Ok(shown)
}

fn delete_provider(file: &Path, id: &str) -> Result<()> {
  let mut providers = read_providers(file);
  let before = providers.len();
  providers.retain(|p| p.id != id);
  if providers.len() != before {
    write_providers(file, &providers)?;
  }
  Ok(())
}

fn provider_of(id: &str) -> Result<Provider> {
  read_providers(&config_file()?)
    .into_iter()
    .find(|p| p.id == id)
    .ok_or_else(|| format!("No AI provider {id}"))
}

/// The URL of a path of the provider's API, e.g. `/chat/completions`: only
/// under its base URL.
fn url_of(provider: &Provider, path: &str) -> Result<String> {
  if !path.starts_with('/')
    || path.contains("..")
    || path.contains("//")
    || path.contains('#')
    || path.contains('\\')
  {
    return Err(format!("Bad path {path}"));
  }
  Ok(format!("{}{path}", checked_base(&provider.base_url)?))
}

/// The headers of the provider: the key, the version of the API.
fn headers_of(provider: &Provider) -> Vec<(&'static str, String)> {
  let key = provider.key.clone().filter(|k| !k.is_empty());
  match provider.kind.as_str() {
    "anthropic" => {
      let mut headers = vec![("anthropic-version", ANTHROPIC_VERSION.to_string())];
      if let Some(key) = key {
        headers.push(("x-api-key", key));
      }
      headers
    }
    _ => key
      .map(|key| vec![("authorization", format!("Bearer {key}"))])
      .unwrap_or_default(),
  }
}

fn client() -> Result<&'static reqwest::Client> {
  static CLIENT: LazyLock<std::result::Result<reqwest::Client, String>> =
    LazyLock::new(|| {
      reqwest::Client::builder()
        .user_agent(concat!("mdsilo/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        // a local model may take long to load and to answer the first token
        .read_timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
    });
  CLIENT.as_ref().map_err(|e| e.clone())
}

async fn send(
  provider: &Provider,
  method: &str,
  path: &str,
  body: Option<serde_json::Value>,
) -> Result<reqwest::Response> {
  let url = url_of(provider, path)?;
  let mut request = match method {
    "GET" => client()?.get(&url),
    "POST" => client()?.post(&url),
    _ => return Err(format!("Bad method {method}")),
  };
  for (name, value) in headers_of(provider) {
    request = request.header(name, value);
  }
  if let Some(body) = body {
    request = request.json(&body);
  }
  let response = request
    .send()
    .await
    .map_err(|e| format!("{}: {e}", provider.label))?;
  let status = response.status();
  if status.is_success() {
    return Ok(response);
  }
  let text = response.text().await.unwrap_or_default();
  Err(format!(
    "{status}: {}",
    text.chars().take(500).collect::<String>()
  ))
}

/// The text of the bytes read so far that is whole UTF-8; the rest is kept
/// for the next chunk (a character can be cut between two).
fn take_text(buffer: &mut Vec<u8>) -> String {
  let valid = match std::str::from_utf8(buffer) {
    Ok(_) => buffer.len(),
    Err(e) if e.error_len().is_none() => e.valid_up_to(),
    // not UTF-8 at all: replaced, not to stop the stream
    Err(_) => buffer.len(),
  };
  let text = String::from_utf8_lossy(&buffer[..valid]).into_owned();
  buffer.drain(..valid);
  text
}

/// What `ai_stream` sends as the answer comes: its text, then its end (sent
/// on the channel, not by the end of the command: the messages of a channel can
/// come after the answer of the command).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StreamEvent {
  Text { text: String },
  End,
}

// the streams canceled, by the id the frontend gave
static CANCELED: LazyLock<Mutex<HashSet<u64>>> = LazyLock::new(Default::default);

fn take_canceled(request: u64) -> bool {
  CANCELED
    .lock()
    .map(|mut set| set.remove(&request))
    .unwrap_or(false)
}

#[tauri::command]
pub async fn ai_providers() -> Result<Vec<ShownProvider>> {
  Ok(
    read_providers(&config_file()?)
      .iter()
      .map(ShownProvider::from)
      .collect(),
  )
}

#[tauri::command]
pub async fn ai_save_provider(provider: ProviderInput) -> Result<ShownProvider> {
  save_provider(&config_file()?, provider)
}

#[tauri::command]
pub async fn ai_delete_provider(id: String) -> Result<()> {
  delete_provider(&config_file()?, &id)
}

/// A request answered in JSON, e.g. the models of the provider.
#[tauri::command]
pub async fn ai_fetch(
  provider: String,
  method: String,
  path: String,
  body: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
  let provider = provider_of(&provider)?;
  let response = send(&provider, &method, &path, body).await?;
  response.json().await.map_err(|e| e.to_string())
}

/// A request answered in a stream (server-sent events): the text of it sent
/// to `on_event` as it comes, then `End`, at its end or once canceled by
/// `ai_cancel`; an error is the error of the command.
#[tauri::command]
pub async fn ai_stream(
  provider: String,
  path: String,
  body: serde_json::Value,
  request: u64,
  on_event: Channel<StreamEvent>,
) -> Result<()> {
  let send_text = |text: String| {
    on_event
      .send(StreamEvent::Text { text })
      .map_err(|e| e.to_string())
  };
  let provider = provider_of(&provider)?;
  let mut response = send(&provider, "POST", &path, Some(body)).await?;
  let mut buffer = Vec::new();
  loop {
    if take_canceled(request) {
      break;
    }
    let chunk = response.chunk().await.map_err(|e| e.to_string())?;
    let Some(chunk) = chunk else { break };
    buffer.extend_from_slice(&chunk);
    let text = take_text(&mut buffer);
    if !text.is_empty() {
      send_text(text)?;
    }
  }
  take_canceled(request);
  if !buffer.is_empty() {
    send_text(String::from_utf8_lossy(&buffer).into_owned())?;
  }
  on_event.send(StreamEvent::End).map_err(|e| e.to_string())
}

/// Stop a stream of `ai_stream` at its next chunk.
#[tauri::command]
pub fn ai_cancel(request: u64) {
  if let Ok(mut set) = CANCELED.lock() {
    set.insert(request);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_file(name: &str) -> PathBuf {
    let dir =
      std::env::temp_dir().join(format!("mdsilo-ai-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir.join("ai-config.json")
  }

  fn input(key: Option<&str>) -> ProviderInput {
    ProviderInput {
      id: "p1".into(),
      kind: "openai".into(),
      label: "Local".into(),
      base_url: "http://localhost:11434/v1/".into(),
      key: key.map(String::from),
      settings: serde_json::json!({ "chatModel": "llama3" }),
    }
  }

  #[test]
  fn saves_keeps_and_forgets_the_key() {
    let file = temp_file("key");
    let shown = save_provider(&file, input(Some("secret"))).unwrap();
    assert!(shown.has_key);
    assert_eq!(shown.base_url, "http://localhost:11434/v1");
    // the key is never in what is shown
    assert!(!serde_json::to_string(&shown).unwrap().contains("secret"));

    // none: kept
    save_provider(&file, input(None)).unwrap();
    assert_eq!(read_providers(&file)[0].key.as_deref(), Some("secret"));
    // empty: forgotten
    let shown = save_provider(&file, input(Some(""))).unwrap();
    assert!(!shown.has_key);
    assert_eq!(read_providers(&file)[0].key, None);
    assert_eq!(read_providers(&file).len(), 1);

    delete_provider(&file, "p1").unwrap();
    assert!(read_providers(&file).is_empty());
  }

  #[test]
  fn refuses_bad_providers() {
    let file = temp_file("bad");
    let mut bad = input(None);
    bad.kind = "other".into();
    assert!(save_provider(&file, bad).is_err());
    let mut bad = input(None);
    bad.base_url = "file:///etc".into();
    assert!(save_provider(&file, bad).is_err());
    let mut bad = input(None);
    bad.base_url = "https://a.com/v1?x=1".into();
    assert!(save_provider(&file, bad).is_err());
    let mut bad = input(None);
    bad.id = " ".into();
    assert!(save_provider(&file, bad).is_err());
  }

  #[test]
  fn sends_only_under_the_base_url() {
    let p = Provider {
      id: "p".into(),
      kind: "openai".into(),
      label: "P".into(),
      base_url: "https://api.example.com/v1".into(),
      key: Some("k".into()),
      settings: serde_json::Value::Null,
    };
    assert_eq!(
      url_of(&p, "/chat/completions").unwrap(),
      "https://api.example.com/v1/chat/completions"
    );
    for bad in ["chat", "/../x", "//evil.com/x", "/x#y", "/a://b", "/a\\b"] {
      assert!(url_of(&p, bad).is_err(), "{bad}");
    }
  }

  #[test]
  fn headers_by_kind() {
    let mut p = Provider {
      id: "p".into(),
      kind: "openai".into(),
      label: "P".into(),
      base_url: "https://a.com".into(),
      key: Some("k".into()),
      settings: serde_json::Value::Null,
    };
    assert_eq!(
      headers_of(&p),
      vec![("authorization", "Bearer k".to_string())]
    );
    p.kind = "anthropic".into();
    assert_eq!(
      headers_of(&p),
      vec![
        ("anthropic-version", ANTHROPIC_VERSION.to_string()),
        ("x-api-key", "k".to_string())
      ]
    );
    p.kind = "openai".into();
    p.key = None;
    assert!(headers_of(&p).is_empty());
  }

  #[test]
  fn keeps_a_character_cut_between_chunks() {
    let bytes = "a中".as_bytes();
    let mut buffer = bytes[..2].to_vec();
    assert_eq!(take_text(&mut buffer), "a");
    assert_eq!(buffer.len(), 1);
    buffer.extend_from_slice(&bytes[2..]);
    assert_eq!(take_text(&mut buffer), "中");
    assert!(buffer.is_empty());
  }

  #[test]
  fn stream_events_as_the_frontend_reads_them() {
    let text = StreamEvent::Text { text: "hi".into() };
    assert_eq!(
      serde_json::to_string(&text).unwrap(),
      r#"{"type":"text","text":"hi"}"#
    );
    assert_eq!(
      serde_json::to_string(&StreamEvent::End).unwrap(),
      r#"{"type":"end"}"#
    );
  }

  #[test]
  fn cancel_is_taken_once() {
    ai_cancel(42);
    assert!(take_canceled(42));
    assert!(!take_canceled(42));
  }
}
