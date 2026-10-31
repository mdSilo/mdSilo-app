//! Windows: the speech of WinRT (`Windows.Media.SpeechSynthesis`), in the
//! app: the OneCore voices, more of them and better than System.Speech's
//! (SAPI); the audio is a WAV stream.

use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceInformation};
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use windows::core::HSTRING;

use super::{Audio, Config, Engine, EngineInfo, Kind, Result, SpeakOptions, Voice};

fn error(e: windows::core::Error) -> String {
  format!("The speech of Windows: {}", e.message())
}

/// WinRT on this thread (a thread of the pool): in the multithreaded
/// apartment; already initialized, it stays as it is.
fn init() {
  // SAFETY: no reserved argument; the result (S_FALSE, RPC_E_CHANGED_MODE)
  // tells only how it was before
  let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
}

fn all_voices() -> Result<Vec<VoiceInformation>> {
  init();
  Ok(
    SpeechSynthesizer::AllVoices()
      .map_err(error)?
      .into_iter()
      .collect(),
  )
}

fn voice_of(info: &VoiceInformation) -> Result<Voice> {
  Ok(Voice {
    id: info.Id().map_err(error)?.to_string(),
    name: info.DisplayName().map_err(error)?.to_string(),
    lang: info.Language().map_err(error)?.to_string(),
  })
}

/// The voice chosen, or the first of the language.
fn chosen(options: &SpeakOptions) -> Result<Option<VoiceInformation>> {
  let voices = all_voices()?;
  if let Some(id) = &options.voice {
    for v in voices {
      if v.Id().map_err(error)? == id.as_str() {
        return Ok(Some(v));
      }
    }
    return Ok(None);
  }
  let Some(lang) = options.lang.as_deref().map(str::to_lowercase) else {
    return Ok(None);
  };
  let base = lang.split('-').next().unwrap_or(&lang).to_string();
  let mut of_base = None;
  for v in voices {
    let l = v.Language().map_err(error)?.to_string().to_lowercase();
    if l == lang || l.starts_with(&format!("{lang}-")) {
      return Ok(Some(v));
    }
    if of_base.is_none() && l.split('-').next() == Some(base.as_str()) {
      of_base = Some(v);
    }
  }
  Ok(of_base)
}

pub struct WinRt;

impl Engine for WinRt {
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
    all_voices()?.iter().map(voice_of).collect()
  }

  fn synthesize(
    &self,
    text: &str,
    options: &SpeakOptions,
    _: &Config,
  ) -> Result<Audio> {
    init();
    let synth = SpeechSynthesizer::new().map_err(error)?;
    if let Some(voice) = chosen(options)? {
      synth.SetVoice(&voice).map_err(error)?;
    }
    let stream = synth
      .SynthesizeTextToStreamAsync(&HSTRING::from(text))
      .map_err(error)?
      .join()
      .map_err(error)?;
    let size = stream.Size().map_err(error)? as u32;
    let reader =
      DataReader::CreateDataReader(&stream.GetInputStreamAt(0).map_err(error)?)
        .map_err(error)?;
    reader
      .LoadAsync(size)
      .map_err(error)?
      .join()
      .map_err(error)?;
    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).map_err(error)?;
    Ok(Audio { bytes, ext: "wav" })
  }
}
