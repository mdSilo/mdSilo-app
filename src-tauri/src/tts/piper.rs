//! Piper: neural voices on this computer, offline. The program and the
//! voices (an `.onnx` model and its `.onnx.json` each) are the user's, from
//! https://github.com/OHF-Voice/piper1-gpl.

use std::path::Path;
use std::process::Command;

use super::system::{audio_of, output_of};
use super::{
  Audio, Config, Engine, EngineInfo, Field, Kind, Result, SpeakOptions, Voice,
};

fn program(config: &Config) -> &str {
  config
    .get("program")
    .map(|p| p.as_str())
    .filter(|p| !p.is_empty())
    .unwrap_or("piper")
}

/// The language of a voice: of its `.onnx.json`, else of its name, as
/// `en_US-lessac-medium`.
fn lang_of(model: &Path) -> String {
  let json = model.with_extension("onnx.json");
  let of_json = std::fs::read(&json)
    .ok()
    .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
    .and_then(|v| v.pointer("/language/code")?.as_str().map(String::from));
  let of_name = || {
    model
      .file_stem()
      .and_then(|s| s.to_str())
      .and_then(|s| s.split('-').next())
      .map(String::from)
      .unwrap_or_default()
  };
  of_json.unwrap_or_else(of_name).replace('_', "-")
}

/// The voices in the folder of voices.
fn voices_in(dir: &Path) -> Vec<Voice> {
  let mut voices: Vec<Voice> = std::fs::read_dir(dir)
    .into_iter()
    .flatten()
    .flatten()
    .map(|e| e.path())
    .filter(|p| p.extension().is_some_and(|e| e == "onnx"))
    .map(|p| Voice {
      id: p.to_string_lossy().into_owned(),
      name: p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string(),
      lang: lang_of(&p),
    })
    .collect();
  voices.sort_by(|a, b| a.name.cmp(&b.name));
  voices
}

pub struct Piper;

impl Engine for Piper {
  fn info(&self) -> EngineInfo {
    EngineInfo {
      id: "piper",
      name: "Piper (offline)",
      kind: Kind::Audio,
      online: false,
      fields: vec![
        Field {
          name: "voices",
          label: "Folder of voices",
          secret: false,
          placeholder: "the folder of the .onnx files",
        },
        Field {
          name: "program",
          label: "Program",
          secret: false,
          placeholder: "piper",
        },
      ],
    }
  }

  fn available(&self, config: &Config) -> bool {
    let has_voices = config
      .get("voices")
      .is_some_and(|dir| !voices_in(Path::new(dir)).is_empty());
    has_voices && Command::new(program(config)).arg("--help").output().is_ok()
  }

  fn voices(&self, config: &Config) -> Result<Vec<Voice>> {
    let dir = config.get("voices").ok_or("No folder of Piper voices")?;
    Ok(voices_in(Path::new(dir)))
  }

  fn synthesize(
    &self,
    text: &str,
    options: &SpeakOptions,
    config: &Config,
  ) -> Result<Audio> {
    let voices = self.voices(config)?;
    let lang = options.lang.as_deref().unwrap_or("").to_lowercase();
    let base = lang.split('-').next().unwrap_or("").to_string();
    let model = options
      .voice
      .clone()
      .or_else(|| {
        voices
          .iter()
          .find(|v| !base.is_empty() && v.lang.to_lowercase().starts_with(&base))
          .or(voices.first())
          .map(|v| v.id.clone())
      })
      .ok_or("No Piper voice")?;
    audio_of("wav", |path| {
      let mut command = Command::new(program(config));
      command.args(["-m", &model, "-f"]).arg(path);
      output_of(command, text).map(|_| ())
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn voices_of_the_folder() {
    let dir =
      std::env::temp_dir().join(format!("mdsilo-piper-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("en_US-lessac-medium.onnx"), "").unwrap();
    std::fs::write(dir.join("voice.onnx"), "").unwrap();
    std::fs::write(
      dir.join("voice.onnx.json"),
      r#"{"language":{"code":"zh_CN"}}"#,
    )
    .unwrap();
    std::fs::write(dir.join("notes.txt"), "").unwrap();
    let voices = voices_in(&dir);
    assert_eq!(
      voices
        .iter()
        .map(|v| (v.name.as_str(), v.lang.as_str()))
        .collect::<Vec<_>>(),
      [("en_US-lessac-medium", "en-US"), ("voice", "zh-CN")]
    );
    assert!(voices[0].id.ends_with("en_US-lessac-medium.onnx"));
    assert!(voices_in(&dir.join("none")).is_empty());
    let _ = std::fs::remove_dir_all(&dir);
  }
}
