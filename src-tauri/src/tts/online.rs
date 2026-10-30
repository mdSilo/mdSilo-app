//! The speech of services, with the user's own key: Azure Speech, and the
//! APIs alike OpenAI's `audio/speech` (OpenAI, and servers of other voices
//! with the same API, e.g. Kokoro).

use serde::Deserialize;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use super::{
  Audio, Config, Engine, EngineInfo, Field, Kind, Result, SpeakOptions, Voice,
};

fn client() -> Result<&'static reqwest::blocking::Client> {
  static CLIENT: LazyLock<std::result::Result<reqwest::blocking::Client, String>> =
    LazyLock::new(|| {
      reqwest::blocking::Client::builder()
        .user_agent(concat!("mdsilo/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
    });
  CLIENT.as_ref().map_err(|e| e.clone())
}

fn setting<'a>(config: &'a Config, name: &str) -> Option<&'a str> {
  config
    .get(name)
    .map(|v| v.as_str())
    .filter(|v| !v.is_empty())
}

/// The body of the response, or its status and text as the error.
fn checked(response: reqwest::blocking::Response) -> Result<Vec<u8>> {
  let status = response.status();
  let bytes = response.bytes().map_err(|e| e.to_string())?;
  if !status.is_success() {
    let text = String::from_utf8_lossy(&bytes);
    return Err(format!(
      "{status}: {}",
      text.chars().take(300).collect::<String>()
    ));
  }
  Ok(bytes.to_vec())
}

fn escape_xml(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  for c in text.chars() {
    match c {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&apos;"),
      _ => out.push(c),
    }
  }
  out
}

// Azure Speech

/// A voice of Azure's `voices/list`.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AzureVoice {
  short_name: String,
  display_name: String,
  locale: String,
}

/// speaks every language, the voice when none is chosen and none of the
/// language is known
const AZURE_DEFAULT_VOICE: &str = "en-US-AvaMultilingualNeural";

fn parse_azure_voices(json: &[u8]) -> Result<Vec<Voice>> {
  let voices: Vec<AzureVoice> =
    serde_json::from_slice(json).map_err(|e| e.to_string())?;
  Ok(
    voices
      .into_iter()
      .map(|v| Voice {
        name: format!("{} ({})", v.display_name, v.short_name),
        id: v.short_name,
        lang: v.locale,
      })
      .collect(),
  )
}

fn azure_ssml(text: &str, lang: &str, voice: &str) -> String {
  format!(
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{}'><voice name='{}'>{}</voice></speak>",
    escape_xml(lang),
    escape_xml(voice),
    escape_xml(text)
  )
}

/// The voice chosen, or the first of the language.
fn voice_for(options: &SpeakOptions, voices: &[Voice]) -> Option<String> {
  if let Some(voice) = &options.voice {
    return Some(voice.clone());
  }
  let lang = options.lang.as_deref()?.to_lowercase();
  let base = lang.split('-').next().unwrap_or(&lang).to_string();
  let of = |prefix: &str| {
    voices
      .iter()
      .find(|v| v.lang.to_lowercase().starts_with(prefix))
      .map(|v| v.id.clone())
  };
  of(&lang).or_else(|| of(&base))
}

#[derive(Default)]
pub struct Azure {
  /// the voices, by region, asked once
  voices: Mutex<Option<(String, Vec<Voice>)>>,
}

impl Azure {
  fn endpoint(config: &Config, path: &str) -> Result<(String, String)> {
    let key = setting(config, "key").ok_or("No key of Azure Speech")?;
    let region = setting(config, "region").ok_or("No region of Azure Speech")?;
    Ok((
      format!("https://{region}.tts.speech.microsoft.com/cognitiveservices/{path}"),
      key.to_string(),
    ))
  }
}

impl Engine for Azure {
  fn info(&self) -> EngineInfo {
    EngineInfo {
      id: "azure",
      name: "Azure Speech",
      kind: Kind::Audio,
      online: true,
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
          placeholder: "eastus",
        },
      ],
    }
  }

  fn available(&self, config: &Config) -> bool {
    setting(config, "key").is_some() && setting(config, "region").is_some()
  }

  fn voices(&self, config: &Config) -> Result<Vec<Voice>> {
    let (url, key) = Self::endpoint(config, "voices/list")?;
    let mut cached = self.voices.lock().unwrap();
    if let Some((of, voices)) = cached.as_ref()
      && *of == url
    {
      return Ok(voices.clone());
    }
    let response = client()?
      .get(&url)
      .header("Ocp-Apim-Subscription-Key", key)
      .send()
      .map_err(|e| e.to_string())?;
    let voices = parse_azure_voices(&checked(response)?)?;
    *cached = Some((url, voices.clone()));
    Ok(voices)
  }

  fn synthesize(
    &self,
    text: &str,
    options: &SpeakOptions,
    config: &Config,
  ) -> Result<Audio> {
    let voice = voice_for(options, &self.voices(config).unwrap_or_default())
      .unwrap_or_else(|| AZURE_DEFAULT_VOICE.into());
    let lang = options.lang.as_deref().unwrap_or("en-US");
    let (url, key) = Self::endpoint(config, "v1")?;
    let response = client()?
      .post(&url)
      .header("Ocp-Apim-Subscription-Key", key)
      .header("Content-Type", "application/ssml+xml")
      .header(
        "X-Microsoft-OutputFormat",
        "audio-24khz-48kbitrate-mono-mp3",
      )
      .body(azure_ssml(text, lang, &voice))
      .send()
      .map_err(|e| e.to_string())?;
    Ok(Audio {
      bytes: checked(response)?,
      ext: "mp3",
    })
  }
}

// OpenAI and alike

const OPENAI_URL: &str = "https://api.openai.com/v1";
const OPENAI_MODEL: &str = "gpt-4o-mini-tts";
const OPENAI_VOICES: &str =
  "alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse";

/// The voices given in the settings, else OpenAI's: of no language, they
/// speak them all.
fn openai_voices(config: &Config) -> Vec<Voice> {
  setting(config, "voices")
    .unwrap_or(OPENAI_VOICES)
    .split(',')
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(|v| Voice {
      id: v.into(),
      name: v.into(),
      lang: String::new(),
    })
    .collect()
}

pub struct OpenAi;

impl Engine for OpenAi {
  fn info(&self) -> EngineInfo {
    EngineInfo {
      id: "openai",
      name: "OpenAI or alike",
      kind: Kind::Audio,
      online: true,
      fields: vec![
        Field {
          name: "key",
          label: "Key",
          secret: true,
          placeholder: "",
        },
        Field {
          name: "url",
          label: "API URL",
          secret: false,
          placeholder: OPENAI_URL,
        },
        Field {
          name: "model",
          label: "Model",
          secret: false,
          placeholder: OPENAI_MODEL,
        },
        Field {
          name: "voices",
          label: "Voices",
          secret: false,
          placeholder: OPENAI_VOICES,
        },
      ],
    }
  }

  /// a key, or the URL of a server of one's own, which may need none
  fn available(&self, config: &Config) -> bool {
    setting(config, "key").is_some() || setting(config, "url").is_some()
  }

  fn voices(&self, config: &Config) -> Result<Vec<Voice>> {
    Ok(openai_voices(config))
  }

  fn synthesize(
    &self,
    text: &str,
    options: &SpeakOptions,
    config: &Config,
  ) -> Result<Audio> {
    let url = setting(config, "url")
      .unwrap_or(OPENAI_URL)
      .trim_end_matches('/');
    let voice = options
      .voice
      .clone()
      .or_else(|| openai_voices(config).into_iter().next().map(|v| v.id))
      .ok_or("No voice")?;
    let mut request =
      client()?
        .post(format!("{url}/audio/speech"))
        .json(&serde_json::json!({
          "model": setting(config, "model").unwrap_or(OPENAI_MODEL),
          "input": text,
          "voice": voice,
          "response_format": "mp3",
        }));
    if let Some(key) = setting(config, "key") {
      request = request.bearer_auth(key);
    }
    let response = request.send().map_err(|e| e.to_string())?;
    Ok(Audio {
      bytes: checked(response)?,
      ext: "mp3",
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn voice(id: &str, lang: &str) -> Voice {
    Voice {
      id: id.into(),
      name: id.into(),
      lang: lang.into(),
    }
  }

  #[test]
  fn azure_voices_and_ssml() {
    let json = br#"[{"Name":"Microsoft Server Speech Text to Speech Voice (en-US, JennyNeural)","DisplayName":"Jenny","LocalName":"Jenny","ShortName":"en-US-JennyNeural","Gender":"Female","Locale":"en-US"}]"#;
    assert_eq!(
      parse_azure_voices(json).unwrap(),
      [Voice {
        id: "en-US-JennyNeural".into(),
        name: "Jenny (en-US-JennyNeural)".into(),
        lang: "en-US".into()
      }]
    );
    assert_eq!(
      azure_ssml("Tom & <Jerry>", "en-US", "en-US-JennyNeural"),
      "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='en-US-JennyNeural'>Tom &amp; &lt;Jerry&gt;</voice></speak>"
    );
  }

  #[test]
  fn voice_chosen_or_of_the_language() {
    let voices = [
      voice("en-US-A", "en-US"),
      voice("zh-CN-B", "zh-CN"),
      voice("zh-TW-C", "zh-TW"),
    ];
    let options = |voice: Option<&str>, lang: Option<&str>| SpeakOptions {
      voice: voice.map(Into::into),
      lang: lang.map(Into::into),
      rate: None,
    };
    assert_eq!(
      voice_for(&options(Some("x"), Some("zh")), &voices).as_deref(),
      Some("x")
    );
    assert_eq!(
      voice_for(&options(None, Some("zh-TW")), &voices).as_deref(),
      Some("zh-TW-C")
    );
    assert_eq!(
      voice_for(&options(None, Some("zh")), &voices).as_deref(),
      Some("zh-CN-B")
    );
    assert_eq!(
      voice_for(&options(None, Some("en-GB")), &voices).as_deref(),
      Some("en-US-A")
    );
    assert_eq!(voice_for(&options(None, Some("fr")), &voices), None);
    assert_eq!(voice_for(&options(None, None), &voices), None);
  }

  #[test]
  fn openai_voices_of_settings_or_default() {
    let mut config = Config::new();
    assert_eq!(openai_voices(&config)[0], voice("alloy", ""));
    config.insert("voices".into(), " af_heart, ,bf_emma ".into());
    assert_eq!(
      openai_voices(&config),
      [voice("af_heart", ""), voice("bf_emma", "")]
    );
  }
}
