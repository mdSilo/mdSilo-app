//! `mdsplugin://localhost/<id>/<path>` (on Windows and Android
//! `http://mdsplugin.localhost/<id>/<path>`): the files of an installed
//! plugin, for its sandboxed iframe. Each page gets a strict CSP: what the
//! plugin loads comes from its own folder, and it reaches the network only
//! when the user granted `net` (see `set_plugin_net`).

use crate::custom_plugins::{base_of_plugin, is_valid_id};
use percent_encoding::percent_decode_str;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::{LazyLock, Mutex};
use tauri::http::{Request, Response, StatusCode, header};

pub const SCHEME: &str = "mdsplugin";

/// The plugins granted `net`, set by the frontend from the device settings
static NET: LazyLock<Mutex<HashSet<String>>> =
  LazyLock::new(|| Mutex::new(HashSet::new()));

#[tauri::command]
pub fn set_plugin_net(ids: Vec<String>) {
  if let Ok(mut net) = NET.lock() {
    *net = ids.into_iter().collect();
  }
}

fn has_net(id: &str) -> bool {
  NET.lock().is_ok_and(|net| net.contains(id))
}

/// The CSP of the files of a plugin. The iframe is sandboxed, its origin is
/// opaque, so the scheme is named in place of 'self'. `connect-src` names it
/// too, for `fetch('app.wasm')` and the like.
pub fn plugin_csp(net: bool) -> String {
  let own = "mdsplugin: http://mdsplugin.localhost";
  let connect = if net {
    format!("{own} https: wss:")
  } else {
    own.to_string()
  };
  format!(
    "default-src 'none'; script-src {own} 'unsafe-inline' 'wasm-unsafe-eval'; \
     style-src {own} 'unsafe-inline'; img-src {own} data: blob:; font-src {own} data:; \
     media-src {own} data: blob:; worker-src {own} blob:; connect-src {connect}; \
     frame-src 'none'; form-action 'none'; base-uri 'none'"
  )
}

fn content_type(path: &str) -> &'static str {
  let ext = path
    .rsplit_once('.')
    .map(|(_, ext)| ext.to_ascii_lowercase())
    .unwrap_or_default();
  match ext.as_str() {
    "html" | "htm" => "text/html; charset=utf-8",
    "js" | "mjs" => "text/javascript; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "json" | "map" => "application/json",
    "svg" => "image/svg+xml",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "gif" => "image/gif",
    "webp" => "image/webp",
    "ico" => "image/x-icon",
    "woff" => "font/woff",
    "woff2" => "font/woff2",
    "ttf" => "font/ttf",
    "otf" => "font/otf",
    "wasm" => "application/wasm",
    "txt" | "md" => "text/plain; charset=utf-8",
    "mp3" => "audio/mpeg",
    "mp4" => "video/mp4",
    _ => "application/octet-stream",
  }
}

/// `/<id>/<path>` → the plugin id and the path in its folder, none if the
/// path is not plainly inside the folder.
pub fn split_path(uri_path: &str) -> Option<(String, String)> {
  let decoded = percent_decode_str(uri_path).decode_utf8().ok()?;
  let mut parts = decoded.trim_start_matches('/').splitn(2, '/');
  let id = parts.next()?.to_string();
  if !is_valid_id(&id) {
    return None;
  }
  let path = parts.next().unwrap_or("").to_string();
  let path = if path.is_empty() {
    "index.html".to_string()
  } else {
    path
  };
  let plain = path.split('/').all(|part| {
    !part.is_empty()
      && part != "."
      && part != ".."
      && !part.contains('\\')
      && !part.contains(':')
  });
  plain.then_some((id, path))
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
  Response::builder()
    .status(code)
    .header(header::CONTENT_TYPE, "text/plain")
    .body(
      code
        .canonical_reason()
        .unwrap_or_default()
        .as_bytes()
        .to_vec(),
    )
    .unwrap_or_default()
}

/// `__cjs/<file>.js`: a CommonJS script of the plugin (an Obsidian plugin's
/// main.js) as an ES module, to import it without eval: its default export
/// runs the script with `module`, `exports` and `require`.
const CJS: &str = "__cjs/";

fn as_module(script: &[u8]) -> Vec<u8> {
  let mut body = b"export default function (module, exports, require) {\n".to_vec();
  body.extend_from_slice(script);
  body.extend_from_slice(b"\n}\n");
  body
}

/// The file at `path` of the plugin `id` in `base`; links out of its folder are not followed.
pub fn serve(base: &Path, uri_path: &str, net: bool) -> Response<Vec<u8>> {
  let Some((id, path)) = split_path(uri_path) else {
    return status(StatusCode::BAD_REQUEST);
  };
  let (path, cjs) = match path.strip_prefix(CJS) {
    Some(inner) if inner.ends_with(".js") => (inner.to_string(), true),
    Some(_) => return status(StatusCode::NOT_FOUND),
    None => (path, false),
  };
  let Ok(root) = base.join(&id).canonicalize() else {
    return status(StatusCode::NOT_FOUND);
  };
  let file = match root.join(&path).canonicalize() {
    Ok(file) if file.starts_with(&root) && file.is_file() => file,
    _ => return status(StatusCode::NOT_FOUND),
  };
  let Ok(body) = fs::read(&file) else {
    return status(StatusCode::NOT_FOUND);
  };
  let body = if cjs { as_module(&body) } else { body };
  // The opaque origin of the iframe makes its own `fetch` and module scripts
  // cross-origin; the files are the plugin's code, not secrets.
  Response::builder()
    .header(header::CONTENT_TYPE, content_type(&path))
    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
    .header(header::CONTENT_SECURITY_POLICY, plugin_csp(net))
    .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
    // not kept: a plugin installed again is read anew, not from a cache
    // (no-cache leaves the webview a copy, which a custom scheme can't
    // revalidate)
    .header(header::CACHE_CONTROL, "no-store")
    .body(body)
    .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR))
}

pub fn handle(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
  let uri_path = request.uri().path();
  let Some((id, _)) = split_path(uri_path) else {
    return status(StatusCode::BAD_REQUEST);
  };
  // on this device or in the workspace
  let Some(base) = base_of_plugin(&id) else {
    return status(StatusCode::NOT_FOUND);
  };
  serve(&base, uri_path, has_net(&id))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn splits_the_id_and_the_path() {
    assert_eq!(
      split_path("/csv/index.html"),
      Some(("csv".into(), "index.html".into()))
    );
    assert_eq!(
      split_path("/csv/"),
      Some(("csv".into(), "index.html".into()))
    );
    assert_eq!(
      split_path("/csv"),
      Some(("csv".into(), "index.html".into()))
    );
    assert_eq!(
      split_path("/csv/a%20b/c.js"),
      Some(("csv".into(), "a b/c.js".into()))
    );
    assert_eq!(split_path("/csv/../other/x"), None);
    assert_eq!(split_path("/csv/%2e%2e/other/x"), None);
    assert_eq!(split_path("/csv/a//b"), None);
    assert_eq!(split_path("/csv/C:/x"), None);
    assert_eq!(split_path("/csv/a%5Cb"), None);
    assert_eq!(split_path("/../x"), None);
    assert_eq!(split_path("/"), None);
  }

  #[test]
  fn names_the_network_only_when_granted() {
    let own = "mdsplugin: http://mdsplugin.localhost";
    assert!(plugin_csp(false).contains(&format!("connect-src {own};")));
    assert!(plugin_csp(true).contains(&format!("connect-src {own} https: wss:")));
    assert!(plugin_csp(true).contains("default-src 'none'"));
    assert!(plugin_csp(false).contains("'wasm-unsafe-eval'"));
  }

  #[test]
  fn serves_the_files_of_the_plugin_only() {
    let base =
      std::env::temp_dir().join(format!("mdsilo-scheme-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(base.join("csv/js")).unwrap();
    fs::write(base.join("csv/index.html"), "<p>hi</p>").unwrap();
    fs::write(base.join("csv/js/app.js"), "1").unwrap();
    fs::write(base.join("secret.txt"), "no").unwrap();

    let page = serve(&base, "/csv/", false);
    assert_eq!(page.status(), StatusCode::OK);
    assert_eq!(page.body(), b"<p>hi</p>");
    assert!(
      page.headers()[header::CONTENT_TYPE]
        .to_str()
        .unwrap()
        .starts_with("text/html")
    );
    assert!(
      page.headers()[header::CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap()
        .contains("connect-src mdsplugin:")
    );
    assert_eq!(page.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");
    assert_eq!(page.headers()[header::CACHE_CONTROL], "no-store");

    let script = serve(&base, "/csv/js/app.js", true);
    assert_eq!(
      script.headers()[header::CONTENT_TYPE],
      "text/javascript; charset=utf-8"
    );
    fs::write(base.join("csv/add.wasm"), b"\0asm").unwrap();
    assert_eq!(
      serve(&base, "/csv/add.wasm", false).headers()[header::CONTENT_TYPE],
      "application/wasm"
    );

    assert_eq!(
      serve(&base, "/csv/../secret.txt", false).status(),
      StatusCode::BAD_REQUEST
    );
    assert_eq!(
      serve(&base, "/csv/js", false).status(),
      StatusCode::NOT_FOUND
    );
    assert_eq!(
      serve(&base, "/csv/none.js", false).status(),
      StatusCode::NOT_FOUND
    );
    assert_eq!(
      serve(&base, "/other/index.html", false).status(),
      StatusCode::NOT_FOUND
    );

    // a CommonJS script, as a module
    fs::write(base.join("csv/main.js"), "module.exports = 1;").unwrap();
    let cjs = serve(&base, "/csv/__cjs/main.js", false);
    assert_eq!(cjs.status(), StatusCode::OK);
    assert_eq!(
      cjs.body(),
      b"export default function (module, exports, require) {\nmodule.exports = 1;\n}\n"
    );
    assert_eq!(
      cjs.headers()[header::CONTENT_TYPE],
      "text/javascript; charset=utf-8"
    );
    assert_eq!(
      serve(&base, "/csv/__cjs/index.html", false).status(),
      StatusCode::NOT_FOUND
    );
    assert_eq!(
      serve(&base, "/csv/__cjs/../../secret.txt", false).status(),
      StatusCode::BAD_REQUEST
    );

    #[cfg(unix)]
    {
      std::os::unix::fs::symlink(base.join("secret.txt"), base.join("csv/link.txt"))
        .unwrap();
      assert_eq!(
        serve(&base, "/csv/link.txt", false).status(),
        StatusCode::NOT_FOUND
      );
    }
    let _ = fs::remove_dir_all(base);
  }
}
