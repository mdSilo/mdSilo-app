//! The speech of the system: speech-dispatcher on Linux (`spd-say`), `say` on
//! macOS, System.Speech on Windows (by PowerShell). The programs are run,
//! nothing linked, so the app starts without them.

use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use super::{
  Audio, Config, Engine, EngineInfo, Kind, Result, SpeakOptions, Spoken, Voice,
};

pub fn engine() -> Box<dyn Engine> {
  Box::new(System::default())
}

/// The program speaking, killed to stop it: a killed client of
/// speech-dispatcher has its speech canceled.
#[derive(Default)]
struct Speaking {
  child: Mutex<Option<(u64, Child)>>,
  next: AtomicU64,
}

impl Speaking {
  fn run(&self, mut command: Command) -> Result<Spoken> {
    self.stop();
    let child = command
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| e.to_string())?;
    let id = self.next.fetch_add(1, Ordering::SeqCst);
    *self.child.lock().unwrap() = Some((id, child));
    loop {
      {
        let mut guard = self.child.lock().unwrap();
        // stopped, maybe another one started since
        let Some((running, child)) = guard.as_mut().filter(|(i, _)| *i == id) else {
          return Ok(Spoken::Cancel);
        };
        debug_assert_eq!(*running, id);
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
          let (_, child) = guard.take().unwrap();
          if status.success() {
            return Ok(Spoken::End);
          }
          let mut error = String::new();
          if let Some(mut stderr) = child.stderr {
            use std::io::Read;
            let _ = stderr.read_to_string(&mut error);
          }
          return Err(format!("The speech failed: {}", error.trim()));
        }
      }
      std::thread::sleep(Duration::from_millis(20));
    }
  }

  fn stop(&self) {
    if let Some((_, mut child)) = self.child.lock().unwrap().take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
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

#[derive(Default)]
struct System {
  #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
  speaking: Speaking,
}

// Linux: speech-dispatcher

/// The voices of `spd-say -L`: NAME LANGUAGE VARIANT, right aligned, names
/// with spaces; the variants (espeak has some 80 for each voice) left out.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn parse_spd_voices(list: &str) -> Vec<Voice> {
  list
    .lines()
    .skip(1)
    .filter_map(|line| {
      let words: Vec<&str> = line.split_whitespace().collect();
      let [name @ .., lang, variant] = words.as_slice() else {
        return None;
      };
      let name = name.join(" ");
      (*variant == "none" && !name.is_empty()).then(|| Voice {
        id: name.to_string(),
        name: name.to_string(),
        lang: spd_lang(lang),
      })
    })
    .collect()
}

/// The language of espeak as BCP 47, e.g. its Mandarin `cmn` as `zh`.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn spd_lang(lang: &str) -> String {
  match lang {
    "cmn" => "zh".into(),
    "yue" => "zh-yue".into(),
    "hak" => "zh-hak".into(),
    _ => lang.to_string(),
  }
}

/// The rate of speech-dispatcher, -100 to 100, of a rate, 1 the normal one:
/// 100 is about 2.5 times as fast.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn spd_rate(rate: f32) -> i32 {
  ((rate.max(0.1).ln() / 2.5f32.ln()) * 100.0)
    .round()
    .clamp(-100.0, 100.0) as i32
}

#[cfg(target_os = "linux")]
impl Engine for System {
  fn info(&self) -> EngineInfo {
    EngineInfo {
      id: "system",
      name: "System (speech-dispatcher)",
      kind: Kind::Live,
      online: false,
      fields: vec![],
    }
  }

  fn available(&self, _: &Config) -> bool {
    Command::new("spd-say")
      .arg("-v")
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status()
      .is_ok_and(|s| s.success())
  }

  fn voices(&self, _: &Config) -> Result<Vec<Voice>> {
    let output = Command::new("spd-say")
      .arg("-L")
      .output()
      .map_err(|e| format!("No speech-dispatcher (spd-say): {e}"))?;
    Ok(parse_spd_voices(&String::from_utf8_lossy(&output.stdout)))
  }

  fn speak(&self, text: &str, options: &SpeakOptions, _: &Config) -> Result<Spoken> {
    let mut command = Command::new("spd-say");
    command
      .arg("-w")
      .args(["-r", &spd_rate(options.rate.unwrap_or(1.0)).to_string()]);
    match (&options.voice, &options.lang) {
      (Some(voice), _) => command.args(["-y", voice]),
      (None, Some(lang)) => command.args(["-l", lang]),
      (None, None) => &mut command,
    };
    self.speaking.run({
      command.arg("--").arg(text);
      command
    })
  }

  fn stop(&self) {
    self.speaking.stop();
  }
}

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
      id: "system",
      name: "System (macOS)",
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
      id: "system",
      name: "System (Windows)",
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
  fn spd_voices_without_variants() {
    let list =
      "                     NAME                 LANGUAGE                  VARIANT
                Afrikaans                       af                     none
English (Caribbean)+Andrea                   en-029                   Andrea
English (Received Pronunciation)               en-GB-X-RP                     none
       Chinese (Mandarin)                      cmn                     none
";
    let voices = parse_spd_voices(list);
    assert_eq!(
      voices
        .iter()
        .map(|v| (v.name.as_str(), v.lang.as_str()))
        .collect::<Vec<_>>(),
      [
        ("Afrikaans", "af"),
        ("English (Received Pronunciation)", "en-GB-X-RP"),
        ("Chinese (Mandarin)", "zh"),
      ]
    );
  }

  #[test]
  fn spd_rates() {
    assert_eq!(spd_rate(1.0), 0);
    assert_eq!(spd_rate(2.5), 100);
    assert_eq!(spd_rate(0.4), -100);
    assert_eq!(spd_rate(10.0), 100);
    assert!(spd_rate(1.5) > 0 && spd_rate(0.75) < 0);
  }

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

  #[cfg(target_os = "linux")]
  #[test]
  fn speaking_stopped() {
    let speaking = std::sync::Arc::new(Speaking::default());
    let other = speaking.clone();
    let run = std::thread::spawn(move || {
      let mut command = Command::new("sleep");
      command.arg("5");
      other.run(command)
    });
    std::thread::sleep(Duration::from_millis(200));
    speaking.stop();
    assert_eq!(run.join().unwrap(), Ok(Spoken::Cancel));
    let mut command = Command::new("true");
    command.arg("");
    assert_eq!(speaking.run(command), Ok(Spoken::End));
    assert!(speaking.run(Command::new("false")).is_err());
  }
}
