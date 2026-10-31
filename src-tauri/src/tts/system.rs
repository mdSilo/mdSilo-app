//! The speech of the system, in the app: speech-dispatcher on Linux (see
//! speechd.rs), AVSpeechSynthesizer on macOS (avspeech.rs), WinRT's speech on
//! Windows (winrt.rs).
//!
//! And by a program, the other choice on macOS and Windows: `say`, and
//! System.Speech by PowerShell (its older SAPI voices).

use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

#[allow(unused_imports)]
use super::{Audio, Config, Engine, EngineInfo, Kind, Result, SpeakOptions, Voice};

#[cfg(target_os = "linux")]
pub fn engine() -> Box<dyn Engine> {
  Box::new(super::speechd::Speechd::default())
}

#[cfg(target_os = "macos")]
pub fn engine() -> Box<dyn Engine> {
  Box::new(super::avspeech::AvSpeech)
}

#[cfg(target_os = "windows")]
pub fn engine() -> Box<dyn Engine> {
  Box::new(super::winrt::WinRt)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
pub fn engine() -> Box<dyn Engine> {
  Box::new(System)
}

/// The speech of the system by a program: `say`, PowerShell.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn by_program() -> Box<dyn Engine> {
  Box::new(System)
}

/// Run the program with the text as its input, its output returned.
pub(super) fn output_of(mut command: Command, input: &str) -> Result<Vec<u8>> {
  let mut child = command
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| e.to_string())?;
  if let Some(mut stdin) = child.stdin.take() {
    stdin
      .write_all(input.as_bytes())
      .map_err(|e| e.to_string())?;
  }
  let output = child.wait_with_output().map_err(|e| e.to_string())?;
  if !output.status.success() {
    return Err(format!(
      "The speech failed: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }
  Ok(output.stdout)
}

/// A temp file for the audio made, removed once read.
pub(super) fn audio_of(
  ext: &'static str,
  make: impl FnOnce(&std::path::Path) -> Result<()>,
) -> Result<Audio> {
  static NEXT: AtomicU64 = AtomicU64::new(0);
  let path = std::env::temp_dir().join(format!(
    "mdsilo-tts-{}-{}.{ext}",
    std::process::id(),
    NEXT.fetch_add(1, Ordering::SeqCst)
  ));
  let made =
    make(&path).and_then(|_| std::fs::read(&path).map_err(|e| e.to_string()));
  let _ = std::fs::remove_file(&path);
  Ok(Audio { bytes: made?, ext })
}

#[cfg_attr(target_os = "linux", allow(dead_code))]
struct System;

// macOS: say

/// The voices of `say -v '?'`: `Eddy (English (UK))  en_GB    # Hello!`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_say_voices(list: &str) -> Vec<Voice> {
  let line =
    regex::Regex::new(r"^(.*?\S)\s+([a-z]{2,3}(?:[_-][A-Za-z0-9]+)*)\s+#").unwrap();
  list
    .lines()
    .filter_map(|l| line.captures(l))
    .map(|c| Voice {
      id: c[1].to_string(),
      name: c[1].to_string(),
      lang: c[2].replace('_', "-"),
    })
    .collect()
}

#[cfg(target_os = "macos")]
impl Engine for System {
  fn info(&self) -> EngineInfo {
    EngineInfo {
      id: "system-program",
      name: "System, by say",
      kind: Kind::Audio,
      online: false,
      fields: vec![],
    }
  }

  fn available(&self, _: &Config) -> bool {
    std::path::Path::new("/usr/bin/say").exists()
  }

  fn voices(&self, _: &Config) -> Result<Vec<Voice>> {
    let output = Command::new("say")
      .args(["-v", "?"])
      .output()
      .map_err(|e| e.to_string())?;
    Ok(parse_say_voices(&String::from_utf8_lossy(&output.stdout)))
  }

  fn synthesize(
    &self,
    text: &str,
    options: &SpeakOptions,
    config: &Config,
  ) -> Result<Audio> {
    // no voice chosen: the first of the language, else the default one
    let voice = options.voice.clone().or_else(|| {
      let lang = options.lang.as_deref()?.to_lowercase();
      self
        .voices(config)
        .ok()?
        .into_iter()
        .find_map(|v| v.lang.to_lowercase().starts_with(&lang).then_some(v.id))
    });
    audio_of("wav", |path| {
      let mut command = Command::new("say");
      command.args([
        "--file-format=WAVE",
        "--data-format=LEI16@22050",
        "-f",
        "-",
        "-o",
      ]);
      command.arg(path);
      if let Some(voice) = &voice {
        command.args(["-v", voice]);
      }
      output_of(command, text).map(|_| ())
    })
  }
}

// Windows: System.Speech, by PowerShell; the text and the voice given by
// stdin and the environment, nothing to quote

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const PS_VOICES: &str = r#"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($v in $s.GetInstalledVoices()) {
  if ($v.Enabled) { $v.VoiceInfo.Name + "`t" + $v.VoiceInfo.Culture.Name }
}
"#;

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const PS_SPEAK: &str = r#"
[Console]::InputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($env:MDSILO_VOICE) { $s.SelectVoice($env:MDSILO_VOICE) }
elseif ($env:MDSILO_LANG) {
  try { $s.SelectVoiceByHints('NotSet', 'NotSet', 0, [Globalization.CultureInfo]::new($env:MDSILO_LANG)) } catch {}
}
$s.SetOutputToWaveFile($env:MDSILO_OUT)
$s.Speak([Console]::In.ReadToEnd())
$s.Dispose()
"#;

/// `Name<tab>culture` by line.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_ps_voices(list: &str) -> Vec<Voice> {
  list
    .lines()
    .filter_map(|line| {
      let (name, lang) = line.trim().split_once('\t')?;
      Some(Voice {
        id: name.into(),
        name: name.into(),
        lang: lang.into(),
      })
    })
    .collect()
}

#[cfg(target_os = "windows")]
fn powershell(script: &str) -> Command {
  use std::os::windows::process::CommandExt;
  const CREATE_NO_WINDOW: u32 = 0x0800_0000;
  // -EncodedCommand: the script as base64 of UTF-16LE
  let utf16: Vec<u8> = script
    .encode_utf16()
    .flat_map(|u| u.to_le_bytes())
    .collect();
  let mut command = Command::new("powershell");
  command
    .args(["-NoProfile", "-NonInteractive", "-EncodedCommand"])
    .arg(base64(&utf16))
    .creation_flags(CREATE_NO_WINDOW);
  command
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn base64(bytes: &[u8]) -> String {
  const CHARS: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
  for chunk in bytes.chunks(3) {
    let n = chunk
      .iter()
      .enumerate()
      .fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
    for i in 0..4 {
      out.push(if i <= chunk.len() {
        CHARS[(n >> (18 - 6 * i) & 63) as usize] as char
      } else {
        '='
      });
    }
  }
  out
}

#[cfg(target_os = "windows")]
impl Engine for System {
  fn info(&self) -> EngineInfo {
    EngineInfo {
      id: "system-program",
      name: "System, by PowerShell (SAPI)",
      kind: Kind::Audio,
      online: false,
      fields: vec![],
    }
  }

  fn available(&self, config: &Config) -> bool {
    self.voices(config).is_ok_and(|v| !v.is_empty())
  }

  fn voices(&self, _: &Config) -> Result<Vec<Voice>> {
    let output = output_of(powershell(PS_VOICES), "")?;
    Ok(parse_ps_voices(&String::from_utf8_lossy(&output)))
  }

  fn synthesize(
    &self,
    text: &str,
    options: &SpeakOptions,
    _: &Config,
  ) -> Result<Audio> {
    audio_of("wav", |path| {
      let mut command = powershell(PS_SPEAK);
      command.env("MDSILO_OUT", path);
      command.env("MDSILO_VOICE", options.voice.as_deref().unwrap_or(""));
      command.env("MDSILO_LANG", options.lang.as_deref().unwrap_or(""));
      output_of(command, text).map(|_| ())
    })
  }
}

// elsewhere (mobile): none yet

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
impl Engine for System {
  fn info(&self) -> EngineInfo {
    EngineInfo {
      id: "system",
      name: "System",
      kind: Kind::Live,
      online: false,
      fields: vec![],
    }
  }

  fn available(&self, _: &Config) -> bool {
    false
  }

  fn voices(&self, _: &Config) -> Result<Vec<Voice>> {
    Ok(vec![])
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn say_voices() {
    let list = "Albert              en_US    # Hello! My name is Albert.
Eddy (English (UK)) en_GB    # Hello! My name is Eddy.
Tingting            zh_CN    # 你好，我叫婷婷。
";
    let voices = parse_say_voices(list);
    assert_eq!(
      voices
        .iter()
        .map(|v| (v.name.as_str(), v.lang.as_str()))
        .collect::<Vec<_>>(),
      [
        ("Albert", "en-US"),
        ("Eddy (English (UK))", "en-GB"),
        ("Tingting", "zh-CN")
      ]
    );
  }

  #[test]
  fn ps_voices_and_base64() {
    let voices = parse_ps_voices(
      "Microsoft Zira Desktop\ten-US\r\nMicrosoft Huihui Desktop\tzh-CN\r\n",
    );
    assert_eq!(
      voices[1],
      Voice {
        id: "Microsoft Huihui Desktop".into(),
        name: "Microsoft Huihui Desktop".into(),
        lang: "zh-CN".into()
      }
    );
    assert_eq!(base64(b""), "");
    assert_eq!(base64(b"f"), "Zg==");
    assert_eq!(base64(b"fo"), "Zm8=");
    assert_eq!(base64(b"foo"), "Zm9v");
    assert_eq!(base64(b"foob"), "Zm9vYg==");
  }
}
