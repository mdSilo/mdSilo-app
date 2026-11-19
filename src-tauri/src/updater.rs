//! The self updater: a new version from the GitHub releases.
//!
//! tauri-plugin-updater asks the endpoint of tauri.conf.json (`plugins.updater`)
//! for the manifest of the latest release, `latest.json`, made by
//! scripts/updater-json.mjs in .github/workflows/release.yml; the download is
//! checked against the public key there, the private key signs it in the
//! release. Desktop only; the frontend is src/shell/updater.ts.
//!
//! `update_check` keeps the update found, `update_install` downloads it (with
//! `update-progress` events), installs it and restarts the app; on Windows the
//! installer closes the app itself.

use serde::Serialize;
use std::sync::Mutex;

/// the update found by the last check, to install
#[derive(Default)]
pub struct PendingUpdate(
  #[cfg(desktop)] Mutex<Option<tauri_plugin_updater::Update>>,
  #[cfg(not(desktop))] Mutex<Option<()>>,
);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub version: String,
  pub current_version: String,
  /// RFC 3339
  pub date: Option<String>,
  pub notes: Option<String>,
  /// installed in place: false when not run from an installed bundle (a dev
  /// build), as the updater would then write over the binary run
  pub can_install: bool,
}

#[derive(Serialize, Clone)]
pub struct Progress {
  pub downloaded: u64,
  pub total: Option<u64>,
}

pub const PROGRESS_EVENT: &str = "update-progress";

/// The bundle this runs from can be updated in place.
#[cfg(desktop)]
fn can_install() -> bool {
  !cfg!(debug_assertions) && tauri::utils::platform::bundle_type().is_some()
}

/// The newer version on GitHub, if any.
#[tauri::command]
pub async fn update_check(
  app: tauri::AppHandle,
  pending: tauri::State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
  #[cfg(desktop)]
  {
    use tauri_plugin_updater::UpdaterExt;
    let update = app
      .updater()
      .map_err(|e| e.to_string())?
      .check()
      .await
      .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
      version: u.version.clone(),
      current_version: u.current_version.clone(),
      date: u.date.and_then(|d| {
        chrono::DateTime::from_timestamp(d.unix_timestamp(), 0)
          .map(|d| d.to_rfc3339())
      }),
      notes: u.body.clone(),
      can_install: can_install(),
    });
    *pending.0.lock().map_err(|e| e.to_string())? = update;
    Ok(info)
  }
  #[cfg(not(desktop))]
  {
    let _ = (app, pending);
    Ok(None)
  }
}

/// Download and install the update of the last check, then restart.
#[tauri::command]
pub async fn update_install(
  app: tauri::AppHandle,
  pending: tauri::State<'_, PendingUpdate>,
) -> Result<(), String> {
  #[cfg(desktop)]
  {
    use tauri::Emitter;
    if !can_install() {
      return Err("this build cannot update itself".into());
    }
    let update = pending
      .0
      .lock()
      .map_err(|e| e.to_string())?
      .take()
      .ok_or("no update to install, check first")?;

    let mut downloaded: u64 = 0;
    // an event per percent (or per MB, when the size is not known)
    let mut last_step: u64 = u64::MAX;
    update
      .download_and_install(
        |chunk, total| {
          downloaded += chunk as u64;
          let step = match total {
            Some(total) if total > 0 => downloaded * 100 / total,
            _ => downloaded >> 20,
          };
          if step != last_step {
            last_step = step;
            let _ = app.emit(PROGRESS_EVENT, Progress { downloaded, total });
          }
        },
        || {},
      )
      .await
      .map_err(|e| e.to_string())?;
    app.restart();
  }
  #[cfg(not(desktop))]
  {
    let _ = (app, pending);
    Err("no updates here".into())
  }
}
