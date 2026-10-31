//! Read aloud: the speech engines of the system and online, behind one
//! interface, see src/speech/speech.ts.
//!
//! An engine either speaks the text itself (`Live`: speech-dispatcher on
//! Linux) or makes the audio of it (`Audio`), a file in the cache played by
//! the frontend; so the audio of a text is made once, and the next sentences
//! can be made while one is read.
//!
//! The settings of an engine (a key, a region) are kept in the app's data
//! dir, never in the workspace, as the tokens of sync.

#[cfg(target_os = "macos")]
mod avspeech;
mod online;
mod piper;
#[cfg(target_os = "linux")]
mod speechd;
mod system;
#[cfg(target_os = "windows")]
mod winrt;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::atomic::write_atomic;

pub(crate) type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
  Live,
  Audio,
}

/// A setting of an engine, e.g. its key.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
  pub name: &'static str,
  pub label: &'static str,
  /// never sent back to the frontend, only whether it is set
  pub secret: bool,
  pub placeholder: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
  pub id: &'static str,
  pub name: &'static str,
  pub kind: Kind,
  /// online: the text read is sent to a service
  pub online: bool,
  pub fields: Vec<Field>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Voice {
  pub id: String,
  pub name: String,
  /// BCP 47, e.g. en-US
  pub lang: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct SpeakOptions {
  pub lang: Option<String>,
  pub voice: Option<String>,
  /// 1 the normal rate; `Audio` engines are made at the normal rate and
  /// played faster or slower
  pub rate: Option<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Spoken {
  End,
  Cancel,
}

/// The audio of a text and its file extension.
pub struct Audio {
  pub bytes: Vec<u8>,
  pub ext: &'static str,
}

pub type Config = BTreeMap<String, String>;

pub trait Engine: Send + Sync {
  fn info(&self) -> EngineInfo;
  /// Can be used here: its program installed, its settings given.
  fn available(&self, config: &Config) -> bool;
  fn voices(&self, config: &Config) -> Result<Vec<Voice>>;
  /// `Live`: speak, return once spoken or stopped.
  fn speak(
    &self,
    _text: &str,
    _options: &SpeakOptions,
    _config: &Config,
  ) -> Result<Spoken> {
    Err(format!("{} makes audio, it does not speak", self.info().id))
  }
  /// `Audio`: the audio of the text.
  fn synthesize(
    &self,
    _text: &str,
    _options: &SpeakOptions,
    _config: &Config,
  ) -> Result<Audio> {
    Err(format!("{} speaks, it makes no audio", self.info().id))
  }
  /// `Live`: stop speaking.
  fn stop(&self) {}
}

fn engines() -> &'static [Box<dyn Engine>] {
  static ENGINES: OnceLock<Vec<Box<dyn Engine>>> = OnceLock::new();
  ENGINES.get_or_init(|| {
    vec![
      system::engine(),
      #[cfg(any(target_os = "macos", target_os = "windows"))]
      system::by_program(),
      Box::new(piper::Piper),
      Box::new(online::Azure::default()),
      Box::new(online::OpenAi),
    ]
  })
}

fn engine(id: &str) -> Result<&'static dyn Engine> {
  engines()
    .iter()
    .find(|e| e.info().id == id)
    .map(|e| e.as_ref())
    .ok_or_else(|| format!("No speech engine {id}"))
}

/// A WAV file of 16-bit PCM, mono.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn wav(samples: &[i16], rate: u32) -> Vec<u8> {
  let data = (samples.len() * 2) as u32;
  let mut out = Vec::with_capacity(44 + data as usize);
  out.extend_from_slice(b"RIFF");
  out.extend_from_slice(&(36 + data).to_le_bytes());
  out.extend_from_slice(b"WAVEfmt ");
  out.extend_from_slice(&16u32.to_le_bytes());
  // PCM, 1 channel, the rate, bytes a second, bytes a frame, bits
  out.extend_from_slice(&1u16.to_le_bytes());
  out.extend_from_slice(&1u16.to_le_bytes());
  out.extend_from_slice(&rate.to_le_bytes());
  out.extend_from_slice(&(rate * 2).to_le_bytes());
  out.extend_from_slice(&2u16.to_le_bytes());
  out.extend_from_slice(&16u16.to_le_bytes());
  out.extend_from_slice(b"data");
  out.extend_from_slice(&data.to_le_bytes());
  for s in samples {
    out.extend_from_slice(&s.to_le_bytes());
  }
  out
}

// the settings of the engines, by engine

fn config_file() -> Result<PathBuf> {
  crate::storage::data_dir()
    .map(|dir| dir.join("tts-config.json"))
    .ok_or_else(|| "No data dir for the speech settings".into())
}

fn read_configs(file: &Path) -> BTreeMap<String, Config> {
  std::fs::read(file)
    .ok()
    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    .unwrap_or_default()
}

fn config_of(id: &str) -> Config {
  config_file()
    .map(|file| read_configs(&file).remove(id).unwrap_or_default())
    .unwrap_or_default()
}

/// Set the given settings of an engine; an empty value forgets the setting.
fn save_config(file: &Path, id: &str, changes: Config) -> Result<()> {
  let mut configs = read_configs(file);
  let config = configs.entry(id.to_string()).or_default();
  for (name, value) in changes {
    let value = value.trim().to_string();
    if value.is_empty() {
      config.remove(&name);
    } else {
      config.insert(name, value);
    }
  }
  if config.is_empty() {
    configs.remove(id);
  }
  let data = serde_json::to_vec_pretty(&configs).map_err(|e| e.to_string())?;
  write_atomic(file, &data).map_err(|e| e.to_string())?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600));
  }
  Ok(())
}

/// The settings to show: the secret ones only as set or not.
fn shown_config(info: &EngineInfo, config: &Config) -> Config {
  info
    .fields
    .iter()
    .filter_map(|f| {
      config.get(f.name).map(|value| {
        let shown = if f.secret {
          String::new()
        } else {
          value.clone()
        };
        (f.name.to_string(), shown)
      })
    })
    .collect()
}

// the audio made, by engine, its settings (e.g. a model), voice and text

fn cache_dir() -> Result<PathBuf> {
  dirs::cache_dir()
    .map(|dir| dir.join("mdsilo").join("tts"))
    .ok_or_else(|| "No cache dir for the speech".into())
}

fn cache_key(
  id: &str,
  config: &Config,
  options: &SpeakOptions,
  text: &str,
) -> String {
  use md5::Digest;
  let mut hasher = md5::Md5::new();
  let config = serde_json::to_string(config).unwrap_or_default();
  for part in [
    id,
    &config,
    options.voice.as_deref().unwrap_or(""),
    options.lang.as_deref().unwrap_or(""),
    text,
  ] {
    hasher.update(part.as_bytes());
    hasher.update([0]);
  }
  crate::books::hex(&hasher.finalize())
}

/// The cached audio of the text, made if not yet.
fn audio_file(
  dir: &Path,
  engine: &dyn Engine,
  text: &str,
  options: &SpeakOptions,
  config: &Config,
) -> Result<PathBuf> {
  let id = engine.info().id;
  let key = cache_key(id, config, options, text);
  let cached = std::fs::read_dir(dir).ok().and_then(|entries| {
    entries
      .flatten()
      .map(|e| e.path())
      .find(|p| p.file_stem().and_then(|s| s.to_str()) == Some(key.as_str()))
  });
  if let Some(path) = cached {
    return Ok(path);
  }
  let audio = engine.synthesize(text, options, config)?;
  if audio.bytes.is_empty() {
    return Err(format!("{id} made no audio"));
  }
  std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  let path = dir.join(format!("{key}.{}", audio.ext));
  write_atomic(&path, &audio.bytes).map_err(|e| e.to_string())?;
  Ok(path)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineState {
  #[serde(flatten)]
  info: EngineInfo,
  available: bool,
  config: Config,
}

async fn blocking<T: Send + 'static>(
  f: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
  tauri::async_runtime::spawn_blocking(f)
    .await
    .map_err(|e| e.to_string())?
}

/// The engines, whether each can be used, and their settings.
#[tauri::command]
pub async fn tts_engines() -> Result<Vec<EngineState>> {
  blocking(|| {
    let file = config_file()?;
    let mut configs = read_configs(&file);
    Ok(
      engines()
        .iter()
        .map(|e| {
          let info = e.info();
          let config = configs.remove(info.id).unwrap_or_default();
          EngineState {
            available: e.available(&config),
            config: shown_config(&info, &config),
            info,
          }
        })
        .collect(),
    )
  })
  .await
}

#[tauri::command]
pub async fn tts_voices(engine: String) -> Result<Vec<Voice>> {
  blocking(move || {
    let e = self::engine(&engine)?;
    e.voices(&config_of(&engine))
  })
  .await
}

/// Speak, by a `Live` engine: "end" once spoken, "cancel" if stopped.
#[tauri::command]
pub async fn tts_speak(
  engine: String,
  text: String,
  options: SpeakOptions,
) -> Result<Spoken> {
  blocking(move || {
    let e = self::engine(&engine)?;
    e.speak(&text, &options, &config_of(&engine))
  })
  .await
}

/// The audio file of the text, by an `Audio` engine.
#[tauri::command]
pub async fn tts_audio(
  engine: String,
  text: String,
  options: SpeakOptions,
) -> Result<PathBuf> {
  blocking(move || {
    let e = self::engine(&engine)?;
    audio_file(&cache_dir()?, e, &text, &options, &config_of(&engine))
  })
  .await
}

#[tauri::command]
pub fn tts_stop() {
  for e in engines() {
    e.stop();
  }
}

/// Change settings of an engine, an empty value to forget one.
#[tauri::command]
pub async fn tts_configure(engine: String, config: Config) -> Result<()> {
  blocking(move || {
    let e = self::engine(&engine)?;
    let names: Vec<_> = e.info().fields.iter().map(|f| f.name).collect();
    if let Some(name) = config.keys().find(|n| !names.contains(&n.as_str())) {
      return Err(format!("{engine} has no setting {name}"));
    }
    save_config(&config_file()?, &engine, config)
  })
  .await
}

/// Forget the audio made.
#[tauri::command]
pub async fn tts_clear_cache() -> Result<()> {
  blocking(|| {
    let dir = cache_dir()?;
    if dir.exists() {
      std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::atomic::{AtomicUsize, Ordering};

  struct Fake(AtomicUsize);

  impl Engine for Fake {
    fn info(&self) -> EngineInfo {
      EngineInfo {
        id: "fake",
        name: "Fake",
        kind: Kind::Audio,
        online: false,
        fields: vec![
          Field {
            name: "key",
            label: "Key",
            secret: true,
            placeholder: "",
          },
          Field {
            name: "region",
            label: "Region",
            secret: false,
            placeholder: "",
          },
        ],
      }
    }
    fn available(&self, _: &Config) -> bool {
      true
    }
    fn voices(&self, _: &Config) -> Result<Vec<Voice>> {
      Ok(vec![])
    }
    fn synthesize(&self, text: &str, _: &SpeakOptions, _: &Config) -> Result<Audio> {
      self.0.fetch_add(1, Ordering::SeqCst);
      Ok(Audio {
        bytes: text.as_bytes().to_vec(),
        ext: "mp3",
      })
    }
  }

  #[test]
  fn audio_made_once_by_voice_and_text() {
    let dir = tempfile_dir("tts-cache");
    let fake = Fake(AtomicUsize::new(0));
    let config = Config::new();
    let a = SpeakOptions {
      voice: Some("A".into()),
      ..Default::default()
    };
    let b = SpeakOptions {
      voice: Some("B".into()),
      ..Default::default()
    };
    let first = audio_file(&dir, &fake, "Hello.", &a, &config).unwrap();
    assert_eq!(first.extension().unwrap(), "mp3");
    assert_eq!(std::fs::read(&first).unwrap(), b"Hello.");
    assert_eq!(
      audio_file(&dir, &fake, "Hello.", &a, &config).unwrap(),
      first
    );
    assert_eq!(fake.0.load(Ordering::SeqCst), 1);
    // the rate is not in the key: played faster or slower
    let faster = SpeakOptions {
      rate: Some(2.0),
      ..a.clone()
    };
    assert_eq!(
      audio_file(&dir, &fake, "Hello.", &faster, &config).unwrap(),
      first
    );
    assert_ne!(
      audio_file(&dir, &fake, "Hello.", &b, &config).unwrap(),
      first
    );
    assert_ne!(audio_file(&dir, &fake, "Hi.", &a, &config).unwrap(), first);
    let other: Config = [("model".to_string(), "m2".to_string())].into();
    assert_ne!(
      audio_file(&dir, &fake, "Hello.", &a, &other).unwrap(),
      first
    );
    assert_eq!(fake.0.load(Ordering::SeqCst), 4);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn wav_header() {
    let w = wav(&[0, 1, -1], 22050);
    assert_eq!(w.len(), 44 + 6);
    assert_eq!(&w[0..4], b"RIFF");
    assert_eq!(u32::from_le_bytes(w[4..8].try_into().unwrap()), 36 + 6);
    assert_eq!(&w[8..16], b"WAVEfmt ");
    assert_eq!(u32::from_le_bytes(w[24..28].try_into().unwrap()), 22050);
    assert_eq!(u32::from_le_bytes(w[28..32].try_into().unwrap()), 44100);
    assert_eq!(&w[36..40], b"data");
    assert_eq!(u32::from_le_bytes(w[40..44].try_into().unwrap()), 6);
    assert_eq!(&w[44..], &[0, 0, 1, 0, 0xff, 0xff]);
  }

  #[test]
  fn settings_saved_forgotten_and_shown() {
    let dir = tempfile_dir("tts-config");
    let file = dir.join("tts-config.json");
    let set = |pairs: &[(&str, &str)]| -> Config {
      pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
    };
    save_config(
      &file,
      "fake",
      set(&[("key", " secret "), ("region", "eastus")]),
    )
    .unwrap();
    save_config(&file, "other", set(&[("key", "x")])).unwrap();
    let configs = read_configs(&file);
    assert_eq!(
      configs["fake"],
      set(&[("key", "secret"), ("region", "eastus")])
    );
    let info = Fake(AtomicUsize::new(0)).info();
    // the key only as set
    assert_eq!(
      shown_config(&info, &configs["fake"]),
      set(&[("key", ""), ("region", "eastus")])
    );
    save_config(&file, "fake", set(&[("key", "")])).unwrap();
    assert_eq!(read_configs(&file)["fake"], set(&[("region", "eastus")]));
    save_config(&file, "fake", set(&[("region", "")])).unwrap();
    assert!(!read_configs(&file).contains_key("fake"));
    assert!(read_configs(&file).contains_key("other"));
    let _ = std::fs::remove_dir_all(&dir);
  }

  fn tempfile_dir(name: &str) -> PathBuf {
    let dir =
      std::env::temp_dir().join(format!("mdsilo-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
  }
}
