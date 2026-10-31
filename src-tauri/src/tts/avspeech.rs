//! macOS: AVSpeechSynthesizer, in the app: the voices of the system,
//! Enhanced and Premium ones downloaded in System Settings too. The audio of
//! an utterance is written to buffers (`writeUtterance:toBufferCallback:`),
//! made a WAV here.

use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use dispatch2::DispatchQueue;
use objc2_avf_audio::{
  AVAudioBuffer, AVAudioCommonFormat, AVAudioPCMBuffer, AVSpeechSynthesisVoice,
  AVSpeechSynthesisVoiceQuality, AVSpeechSynthesizer, AVSpeechUtterance,
};
use objc2_foundation::NSString;

use super::{
  Audio, Config, Engine, EngineInfo, Kind, Result, SpeakOptions, Voice, wav,
};

/// no buffer that long: the synthesizer stuck
const BUFFER_TIMEOUT: Duration = Duration::from_secs(30);

fn all_voices() -> Vec<Voice> {
  // SAFETY: class methods and getters of the voices, from any thread
  unsafe {
    let voices = AVSpeechSynthesisVoice::speechVoices();
    (0..voices.count())
      .map(|i| {
        let v = voices.objectAtIndex(i);
        let quality = v.quality();
        let quality = if quality == AVSpeechSynthesisVoiceQuality::Premium {
          " (Premium)"
        } else if quality == AVSpeechSynthesisVoiceQuality::Enhanced {
          " (Enhanced)"
        } else {
          ""
        };
        Voice {
          id: v.identifier().to_string(),
          name: format!("{}{quality}", v.name()),
          lang: v.language().to_string(),
        }
      })
      .collect()
  }
}

/// The first channel of a buffer, as 16-bit samples, and its rate; none at
/// the end (an empty buffer).
///
/// # Safety
/// `buffer` is a buffer given to the callback of `writeUtterance`.
unsafe fn samples_of(buffer: &AVAudioBuffer) -> Option<(f64, Vec<i16>)> {
  let pcm = buffer.downcast_ref::<AVAudioPCMBuffer>()?;
  // SAFETY: the buffer is valid during the callback; the channel data has
  // frameLength frames, interleaved or not
  unsafe {
    let frames = pcm.frameLength() as usize;
    if frames == 0 {
      return None;
    }
    let format = pcm.format();
    let stride = if format.isInterleaved() {
      format.channelCount() as usize
    } else {
      1
    };
    let common = format.commonFormat();
    let samples = if common == AVAudioCommonFormat::PCMFormatInt16 {
      let data = (*pcm.int16ChannelData()).as_ptr();
      (0..frames).map(|i| *data.add(i * stride)).collect()
    } else if common == AVAudioCommonFormat::PCMFormatFloat32 {
      let data = (*pcm.floatChannelData()).as_ptr();
      (0..frames)
        .map(|i| (*data.add(i * stride) * 32767.0).clamp(-32768.0, 32767.0) as i16)
        .collect()
    } else {
      return None;
    };
    Some((format.sampleRate(), samples))
  }
}

pub struct AvSpeech;

impl Engine for AvSpeech {
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
    !all_voices().is_empty()
  }

  fn voices(&self, _: &Config) -> Result<Vec<Voice>> {
    Ok(all_voices())
  }

  fn synthesize(
    &self,
    text: &str,
    options: &SpeakOptions,
    _: &Config,
  ) -> Result<Audio> {
    let (sender, buffers) = mpsc::channel::<Option<(f64, Vec<i16>)>>();
    let text = text.to_string();
    let voice = options.voice.clone();
    let lang = options.lang.clone();
    // made on the main thread, its run loop delivering the buffers
    DispatchQueue::main().exec_async(move || {
      // SAFETY: the synthesizer and the utterance made and used here, on the
      // main thread; the block kept by the synthesizer until the end
      unsafe {
        let synth = AVSpeechSynthesizer::new();
        let utterance =
          AVSpeechUtterance::speechUtteranceWithString(&NSString::from_str(&text));
        let chosen = match (&voice, &lang) {
          (Some(id), _) => {
            AVSpeechSynthesisVoice::voiceWithIdentifier(&NSString::from_str(id))
          }
          (None, Some(lang)) => AVSpeechSynthesisVoice::voiceWithLanguage(Some(
            &NSString::from_str(lang),
          )),
          (None, None) => None,
        };
        utterance.setVoice(chosen.as_deref());
        // the synthesizer alive until the last buffer, then let go (it
        // keeps the block, the block kept it)
        let alive = RefCell::new(Some(synth.clone()));
        let block = RcBlock::new(move |buffer: NonNull<AVAudioBuffer>| {
          let samples = samples_of(buffer.as_ref());
          let end = samples.is_none();
          let _ = sender.send(samples);
          if end {
            alive.borrow_mut().take();
          }
        });
        synth.writeUtterance_toBufferCallback(&utterance, RcBlock::as_ptr(&block));
      }
    });
    let mut rate = 22050.0;
    let mut samples = Vec::new();
    loop {
      match buffers.recv_timeout(BUFFER_TIMEOUT) {
        Ok(Some((r, s))) => {
          rate = r;
          samples.extend(s);
        }
        Ok(None) => break,
        Err(_) => return Err("The speech of macOS does not answer".into()),
      }
    }
    if samples.is_empty() {
      return Err("The speech of macOS made no audio".into());
    }
    Ok(Audio {
      bytes: wav(&samples, rate.round() as u32),
      ext: "wav",
    })
  }
}
