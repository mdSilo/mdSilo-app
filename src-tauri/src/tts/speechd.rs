//! Linux: speech-dispatcher, by its protocol (SSIP) on its socket. The
//! speech of this client only is canceled, at once: not the screen reader's,
//! nor after the sentence ends, as killing `spd-say` did.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use super::{Config, Engine, EngineInfo, Kind, Result, SpeakOptions, Spoken, Voice};

/// no event that long: speech-dispatcher stuck
const EVENT_TIMEOUT: Duration = Duration::from_secs(120);

/// The socket: `SPEECHD_ADDRESS` (`unix_socket:<path>`), else the default one.
fn socket_path() -> Option<PathBuf> {
  if let Ok(address) = std::env::var("SPEECHD_ADDRESS")
    && let Some(path) = address.strip_prefix("unix_socket:")
  {
    return Some(PathBuf::from(path));
  }
  let runtime = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from)?;
  Some(runtime.join("speech-dispatcher").join("speechd.sock"))
}

/// A connection, speech-dispatcher started if not running (as `spd-say` does).
fn connect() -> Result<UnixStream> {
  let path = socket_path().ok_or("No socket of speech-dispatcher")?;
  if let Ok(stream) = UnixStream::connect(&path) {
    return Ok(stream);
  }
  Command::new("speech-dispatcher")
    .arg("--spawn")
    .status()
    .map_err(|e| format!("No speech-dispatcher: {e}"))?;
  UnixStream::connect(&path).map_err(|e| format!("No speech-dispatcher: {e}"))
}

/// A reply or an event: its code, its lines without the code.
#[derive(Debug, PartialEq)]
struct Message {
  code: u16,
  lines: Vec<String>,
}

struct Ssip<S: std::io::Read + Write> {
  reader: BufReader<S>,
}

impl<S: std::io::Read + Write> Ssip<S> {
  fn new(stream: S) -> Self {
    Ssip {
      reader: BufReader::new(stream),
    }
  }

  fn write(&mut self, text: &str) -> Result<()> {
    self
      .reader
      .get_mut()
      .write_all(text.as_bytes())
      .map_err(|e| e.to_string())
  }

  /// `NNN-data` lines, then `NNN text`.
  fn read(&mut self) -> Result<Message> {
    let mut lines = Vec::new();
    loop {
      let mut line = String::new();
      if self
        .reader
        .read_line(&mut line)
        .map_err(|e| e.to_string())?
        == 0
      {
        return Err("speech-dispatcher closed the connection".into());
      }
      let line = line.trim_end_matches(['\r', '\n']);
      let code = line.get(..3).and_then(|c| c.parse().ok());
      let Some(code) = code else {
        return Err(format!("Not SSIP: {line}"));
      };
      let rest = line.get(4..).unwrap_or("").to_string();
      let last = line.as_bytes().get(3) != Some(&b'-');
      lines.push(rest);
      if last {
        return Ok(Message { code, lines });
      }
    }
  }

  /// The reply of a command, the events before it skipped.
  fn reply(&mut self) -> Result<Message> {
    loop {
      let message = self.read()?;
      if !(700..800).contains(&message.code) {
        return Ok(message);
      }
    }
  }

  fn command(&mut self, command: &str) -> Result<Message> {
    self.write(&format!("{command}\r\n"))?;
    let reply = self.reply()?;
    if !(200..400).contains(&reply.code) {
      return Err(format!(
        "speech-dispatcher: {command}: {}",
        reply.lines.join(" ")
      ));
    }
    Ok(reply)
  }

  /// The text, one line, a leading dot doubled.
  fn send_text(&mut self, text: &str) -> Result<Message> {
    let line = text.replace(['\r', '\n'], " ");
    let line = if line.starts_with('.') {
      format!(".{line}")
    } else {
      line
    };
    self.write(&format!("{line}\r\n.\r\n"))?;
    let reply = self.reply()?;
    if reply.code != 225 {
      return Err(format!("speech-dispatcher: {}", reply.lines.join(" ")));
    }
    Ok(reply)
  }

  /// Until the message is spoken (702) or canceled (703).
  fn wait(&mut self, id: &str) -> Result<Spoken> {
    loop {
      let event = self.read()?;
      if event.lines.first().map(String::as_str) != Some(id) {
        continue;
      }
      match event.code {
        702 => return Ok(Spoken::End),
        703 => return Ok(Spoken::Cancel),
        _ => {}
      }
    }
  }
}

/// The voices of `LIST SYNTHESIS_VOICES`: `name<tab>language<tab>variant`;
/// the variants (espeak has some 80 for each voice) left out.
fn parse_voices(lines: &[String]) -> Vec<Voice> {
  lines
    .iter()
    .filter_map(|line| {
      let mut parts = line.split('\t');
      let (name, lang, variant) = (parts.next()?, parts.next()?, parts.next()?);
      (variant == "none" && !name.is_empty()).then(|| Voice {
        id: name.to_string(),
        name: name.to_string(),
        lang: spd_lang(lang),
      })
    })
    .collect()
}

/// The language of espeak as BCP 47, e.g. its Mandarin `cmn` as `zh`.
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
fn spd_rate(rate: f32) -> i32 {
  ((rate.max(0.1).ln() / 2.5f32.ln()) * 100.0)
    .round()
    .clamp(-100.0, 100.0) as i32
}

/// The settings of the speech, then the text: the id of the message.
fn queue<S: std::io::Read + Write>(
  ssip: &mut Ssip<S>,
  text: &str,
  options: &SpeakOptions,
) -> Result<String> {
  ssip.command("SET SELF CLIENT_NAME user:mdsilo:read_aloud")?;
  ssip.command("SET SELF NOTIFICATION END on")?;
  ssip.command("SET SELF NOTIFICATION CANCEL on")?;
  ssip.command(&format!(
    "SET SELF RATE {}",
    spd_rate(options.rate.unwrap_or(1.0))
  ))?;
  match (&options.voice, &options.lang) {
    (Some(voice), _) => {
      ssip.command(&format!("SET SELF SYNTHESIS_VOICE {voice}"))?
    }
    (None, Some(lang)) => ssip.command(&format!("SET SELF LANGUAGE {lang}"))?,
    (None, None) => Message {
      code: 200,
      lines: vec![],
    },
  };
  ssip.command("SPEAK")?;
  let queued = ssip.send_text(text)?;
  queued
    .lines
    .first()
    .cloned()
    .ok_or_else(|| "No message id".into())
}

/// The connection speaking, to cancel its speech.
#[derive(Default)]
pub struct Speechd {
  speaking: Mutex<Option<(u64, UnixStream)>>,
  next: AtomicU64,
}

impl Engine for Speechd {
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
    connect().is_ok()
  }

  fn voices(&self, _: &Config) -> Result<Vec<Voice>> {
    let mut ssip = Ssip::new(connect()?);
    let reply = ssip.command("LIST SYNTHESIS_VOICES")?;
    let _ = ssip.write("QUIT\r\n");
    Ok(parse_voices(&reply.lines))
  }

  fn speak(&self, text: &str, options: &SpeakOptions, _: &Config) -> Result<Spoken> {
    self.stop();
    let stream = connect()?;
    stream
      .set_read_timeout(Some(EVENT_TIMEOUT))
      .map_err(|e| e.to_string())?;
    let id = self.next.fetch_add(1, Ordering::SeqCst);
    let mut ssip = Ssip::new(stream.try_clone().map_err(|e| e.to_string())?);
    let message = {
      // queued under the lock: a stop meanwhile cancels it, or comes first
      let mut speaking = self.speaking.lock().unwrap();
      *speaking = Some((id, stream));
      queue(&mut ssip, text, options)?
    };
    let spoken = ssip.wait(&message);
    let mut speaking = self.speaking.lock().unwrap();
    if speaking.as_ref().is_some_and(|(i, _)| *i == id) {
      *speaking = None;
    }
    let _ = ssip.write("QUIT\r\n");
    spoken
  }

  fn stop(&self) {
    if let Some((_, mut stream)) = self.speaking.lock().unwrap().take() {
      // the reply and the event read by the one speaking
      let _ = stream.write_all(b"CANCEL SELF\r\n");
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  /// A speech-dispatcher answering each command, the events as given.
  fn fake(
    on_line: impl Fn(&str, &mut UnixStream) + Send + 'static,
  ) -> (UnixStream, std::thread::JoinHandle<Vec<String>>) {
    let (client, server) = UnixStream::pair().unwrap();
    let handle = std::thread::spawn(move || {
      let mut writer = server.try_clone().unwrap();
      let mut got = vec![];
      for line in BufReader::new(server).lines() {
        let Ok(line) = line else { break };
        on_line(&line, &mut writer);
        let quit = line == "QUIT";
        got.push(line);
        if quit {
          break;
        }
      }
      got
    });
    (client, handle)
  }

  fn answer(line: &str, w: &mut UnixStream) {
    let reply: &[u8] = match line {
      "SPEAK" => b"230 OK RECEIVING DATA\r\n",
      "." => b"225-21\r\n225 OK MESSAGE QUEUED\r\n701-21\r\n701-5\r\n701 BEGIN\r\n702-21\r\n702-5\r\n702 END\r\n",
      "CANCEL SELF" => b"210 OK CANCELED\r\n703-21\r\n703-5\r\n703 CANCELED\r\n",
      "LIST SYNTHESIS_VOICES" => b"249-Afrikaans\taf\tnone\r\n249-English (America)+Andrea\ten-US\tAndrea\r\n249-Chinese (Mandarin)\tcmn\tnone\r\n249 OK VOICE LIST SENT\r\n",
      _ if line.starts_with("SET") => b"203 OK SET\r\n",
      _ => return,
    };
    w.write_all(reply).unwrap();
  }

  #[test]
  fn speaks_until_the_end() {
    let (client, server) = fake(answer);
    let mut ssip = Ssip::new(client);
    let options = SpeakOptions {
      lang: Some("en".into()),
      voice: None,
      rate: Some(2.5),
    };
    let id = queue(&mut ssip, ".5 of it\nhere", &options).unwrap();
    assert_eq!(id, "21");
    assert_eq!(ssip.wait(&id), Ok(Spoken::End));
    ssip.write("QUIT\r\n").unwrap();
    let got = server.join().unwrap();
    assert!(got.contains(&"SET SELF RATE 100".to_string()));
    assert!(got.contains(&"SET SELF LANGUAGE en".to_string()));
    // the leading dot doubled, the text on one line
    assert!(got.contains(&"..5 of it here".to_string()));
  }

  #[test]
  fn canceled() {
    // the message queued, not spoken until canceled
    let (client, server) = fake(|line, w| {
      if line == "." {
        w.write_all(b"225-21\r\n225 OK MESSAGE QUEUED\r\n").unwrap();
      } else {
        answer(line, w);
      }
    });
    let mut cancel = client.try_clone().unwrap();
    let mut ssip = Ssip::new(client);
    let options = SpeakOptions {
      voice: Some("Afrikaans".into()),
      ..Default::default()
    };
    let id = queue(&mut ssip, "Hi.", &options).unwrap();
    cancel.write_all(b"CANCEL SELF\r\n").unwrap();
    assert_eq!(ssip.wait(&id), Ok(Spoken::Cancel));
    ssip.write("QUIT\r\n").unwrap();
    assert!(
      server
        .join()
        .unwrap()
        .contains(&"SET SELF SYNTHESIS_VOICE Afrikaans".to_string())
    );
  }

  #[test]
  fn voices_without_variants() {
    let (client, _server) = fake(answer);
    let mut ssip = Ssip::new(client);
    let reply = ssip.command("LIST SYNTHESIS_VOICES").unwrap();
    let voices = parse_voices(&reply.lines);
    assert_eq!(
      voices
        .iter()
        .map(|v| (v.name.as_str(), v.lang.as_str()))
        .collect::<Vec<_>>(),
      [("Afrikaans", "af"), ("Chinese (Mandarin)", "zh")]
    );
  }

  #[test]
  fn an_error_reply() {
    let (client, _server) =
      fake(|_, w| w.write_all(b"410 ERR UNKNOWN PARAMETER\r\n").unwrap());
    let mut ssip = Ssip::new(client);
    assert!(
      ssip
        .command("SET SELF RATE x")
        .unwrap_err()
        .contains("UNKNOWN PARAMETER")
    );
  }

  #[test]
  fn rates() {
    assert_eq!(spd_rate(1.0), 0);
    assert_eq!(spd_rate(2.5), 100);
    assert_eq!(spd_rate(0.4), -100);
    assert_eq!(spd_rate(10.0), 100);
    assert!(spd_rate(1.5) > 0 && spd_rate(0.75) < 0);
  }
}
