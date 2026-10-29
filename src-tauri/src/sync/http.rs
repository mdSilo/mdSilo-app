//! Smart HTTP for libgit2, over reqwest: libgit2 is built without OpenSSL, so
//! `https://` (and `http://`) remotes go through here, with the TLS of
//! reqwest (rustls), which builds for mobile too.
//!
//! The token of a remote is set with `with_credentials` around a git
//! operation; it is sent as basic auth, never put in the URL.

use git2::transport::{Service, SmartSubtransport, SmartSubtransportStream, Transport};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::sync::{LazyLock, Mutex, Once};
use std::time::Duration;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Credentials {
  pub username: String,
  pub token: String,
}

/// remote URL -> credentials, while an operation on it runs
static CREDENTIALS: LazyLock<Mutex<HashMap<String, Credentials>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// Run `f` with the credentials for `url`, if any.
pub fn with_credentials<T>(url: &str, credentials: Option<&Credentials>, f: impl FnOnce() -> T) -> T {
  let url = url.trim_end_matches('/');
  struct Guard(String);
  impl Drop for Guard {
    fn drop(&mut self) {
      if let Ok(mut map) = CREDENTIALS.lock() {
        map.remove(&self.0);
      }
    }
  }
  let _guard = credentials.map(|c| {
    if let Ok(mut map) = CREDENTIALS.lock() {
      map.insert(url.to_string(), c.clone());
    }
    Guard(url.to_string())
  });
  f()
}

fn credentials_for(url: &str) -> Option<Credentials> {
  let map = CREDENTIALS.lock().ok()?;
  // the longest URL the action is under, e.g. the remote of `<url>/info/refs`
  map
    .iter()
    .filter(|(remote, _)| {
      url.strip_prefix(remote.as_str()).is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
    })
    .max_by_key(|(remote, _)| remote.len())
    .map(|(_, c)| c.clone())
}

/// Register the transport for `http://` and `https://`, once.
pub fn register() {
  static ONCE: Once = Once::new();
  ONCE.call_once(|| {
    for prefix in ["https", "http"] {
      // SAFETY: registered once, before any other transport is created
      let result = unsafe { git2::transport::register(prefix, |remote| Transport::smart(remote, true, HttpTransport)) };
      if let Err(e) = result {
        eprintln!("Failed to register the {prefix} transport: {e}");
      }
    }
  });
}

struct HttpTransport;

impl SmartSubtransport for HttpTransport {
  fn action(&self, url: &str, action: Service) -> Result<Box<dyn SmartSubtransportStream>, git2::Error> {
    let base = url.trim_end_matches('/');
    let (method, url, service) = match action {
      Service::UploadPackLs => ("GET", format!("{base}/info/refs?service=git-upload-pack"), "upload-pack"),
      Service::UploadPack => ("POST", format!("{base}/git-upload-pack"), "upload-pack"),
      Service::ReceivePackLs => ("GET", format!("{base}/info/refs?service=git-receive-pack"), "receive-pack"),
      Service::ReceivePack => ("POST", format!("{base}/git-receive-pack"), "receive-pack"),
    };
    Ok(Box::new(HttpStream {
      method,
      credentials: credentials_for(base),
      url,
      service,
      body: Vec::new(),
      response: None,
    }))
  }

  fn close(&self) -> Result<(), git2::Error> {
    Ok(())
  }
}

/// One request: the body written is sent at the first read.
struct HttpStream {
  method: &'static str,
  url: String,
  service: &'static str,
  credentials: Option<Credentials>,
  body: Vec<u8>,
  response: Option<reqwest::blocking::Response>,
}

fn client() -> io::Result<&'static reqwest::blocking::Client> {
  static CLIENT: LazyLock<Result<reqwest::blocking::Client, String>> = LazyLock::new(|| {
    reqwest::blocking::Client::builder()
      .user_agent(concat!("git/2.0 (mdsilo ", env!("CARGO_PKG_VERSION"), ")"))
      .connect_timeout(Duration::from_secs(30))
      .build()
      .map_err(|e| e.to_string())
  });
  CLIENT.as_ref().map_err(|e| io::Error::other(e.clone()))
}

impl HttpStream {
  fn send(&mut self) -> io::Result<reqwest::blocking::Response> {
    let client = client()?;
    let service = self.service;
    let mut request = if self.method == "GET" {
      client.get(&self.url)
    } else {
      client
        .post(&self.url)
        .header("Content-Type", format!("application/x-git-{service}-request"))
        .header("Accept", format!("application/x-git-{service}-result"))
        .body(std::mem::take(&mut self.body))
    };
    if let Some(c) = &self.credentials {
      request = request.basic_auth(&c.username, Some(&c.token));
    }
    let response = request.send().map_err(|e| io::Error::other(format!("{}: {e}", self.url)))?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
      let hint = if self.credentials.is_some() { "check the token" } else { "a token is needed" };
      return Err(io::Error::other(format!("authentication failed (HTTP {}): {hint}", status.as_u16())));
    }
    if !status.is_success() {
      return Err(io::Error::other(format!("HTTP {} from {}", status.as_u16(), self.url)));
    }
    if self.method == "GET" {
      // a dumb server (static files) answers with another type
      let expected = format!("application/x-git-{service}-advertisement");
      let content_type = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("");
      if content_type != expected {
        return Err(io::Error::other(format!("{} is not a smart git server", self.url)));
      }
    }
    Ok(response)
  }
}

impl Read for HttpStream {
  fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
    if self.response.is_none() {
      self.response = Some(self.send()?);
    }
    self.response.as_mut().map_or(Ok(0), |r| r.read(buf))
  }
}

impl Write for HttpStream {
  fn write(&mut self, data: &[u8]) -> io::Result<usize> {
    self.body.extend_from_slice(data);
    Ok(data.len())
  }

  fn flush(&mut self) -> io::Result<()> {
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn credentials_by_the_longest_remote() {
    let a = Credentials { username: "a".into(), token: "1".into() };
    let b = Credentials { username: "b".into(), token: "2".into() };
    with_credentials("https://h.test/u", Some(&a), || {
      with_credentials("https://h.test/u/r", Some(&b), || {
        assert_eq!(credentials_for("https://h.test/u/r/info/refs"), Some(b.clone()));
        assert_eq!(credentials_for("https://h.test/u/x"), Some(a.clone()));
      });
      assert_eq!(credentials_for("https://h.test/u/r/info/refs"), Some(a.clone()));
    });
    assert_eq!(credentials_for("https://h.test/u/r"), None);
  }
}
