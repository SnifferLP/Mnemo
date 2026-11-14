use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{validation, AppError, AppResult};
use crate::AppState;

const REPOSITORY: &str = "SnifferLP/Mnemo";
const RELEASES_API: &str = "https://api.github.com/repos/SnifferLP/Mnemo/releases?per_page=30";
const LATEST_MANIFEST: &str = "latest.json";
const USER_AGENT: &str = "Mnemo-Updater";

static UPDATE_OPERATION_RUNNING: AtomicBool = AtomicBool::new(false);

/// Ensures two checks or installs cannot race each other. The guard is dropped
/// on every exit path, including errors, so a failed request cannot wedge the
/// updater for the rest of the session.
struct OperationGuard;

impl Drop for OperationGuard {
    fn drop(&mut self) {
        UPDATE_OPERATION_RUNNING.store(false, Ordering::SeqCst);
    }
}

fn begin_operation() -> AppResult<OperationGuard> {
    if UPDATE_OPERATION_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(validation("An update operation is already running."));
    }
    Ok(OperationGuard)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateChannel {
    Stable,
    Prerelease,
}

impl UpdateChannel {
    fn parse(value: &str) -> AppResult<Self> {
        match value {
            "stable" => Ok(Self::Stable),
            "prerelease" | "pre-release" => Ok(Self::Prerelease),
            _ => Err(validation("Unknown update channel.")),
        }
    }

    fn allows(self, release: &GithubRelease) -> bool {
        if release.draft {
            return false;
        }
        match self {
            // A stable client must never be offered a GitHub pre-release.
            Self::Stable => !release.prerelease,
            // The pre-release channel includes stable and pre-release builds.
            Self::Prerelease => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Prerelease => "prerelease",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupport {
    pub supported: bool,
    pub current_version: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCandidate {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub published_at: Option<String>,
    pub release_url: String,
    pub channel: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    /// started | progress | installing | finished
    pub stage: String,
    pub downloaded: u64,
    pub content_length: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstallResult {
    pub version: String,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

/// True when the process runs inside a Flatpak sandbox.
///
/// Every Flatpak sandbox exposes `/.flatpak-info`, and portal-launched
/// children also carry `FLATPAK_ID`. Flatpak owns the update cycle for its
/// installations, so the Tauri updater must stay out of the way instead of
/// downloading an AppImage over the sandboxed files.
#[cfg(target_os = "linux")]
fn is_flatpak() -> bool {
    std::path::Path::new("/.flatpak-info").exists() || std::env::var_os("FLATPAK_ID").is_some()
}

pub fn support_info() -> UpdateSupport {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    #[cfg(target_os = "windows")]
    let (supported, message) = if cfg!(target_arch = "x86_64") {
        (true, None)
    } else {
        (
            false,
            Some("Automatic updates are currently available for Windows x64 only.".to_string()),
        )
    };

    #[cfg(target_os = "linux")]
    let (supported, message) = if !cfg!(target_arch = "x86_64") {
        (
            false,
            Some("Automatic updates are currently available for Linux x86_64 only.".to_string()),
        )
    } else if is_flatpak() {
        (
            false,
            Some(
                "This is the Flatpak build of Mnemo. Updates are delivered by Flatpak: run \"flatpak update com.mnemo.study\" or update it from your software centre."
                    .to_string(),
            ),
        )
    } else if std::env::var_os("APPIMAGE").is_some() {
        (true, None)
    } else {
        (
            false,
            Some(
                "Automatic updates are available for the Linux AppImage. This installation is managed by your package manager."
                    .to_string(),
            ),
        )
    };

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let (supported, message) = (
        false,
        Some(
            "Automatic updates are available for Windows and Linux AppImage builds only."
                .to_string(),
        ),
    );

    UpdateSupport {
        supported,
        current_version,
        message,
    }
}

#[tauri::command]
pub fn update_support() -> UpdateSupport {
    support_info()
}

fn release_version(release: &GithubRelease) -> Option<Version> {
    let tag = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name);
    Version::parse(tag).ok()
}

fn has_latest_manifest(release: &GithubRelease) -> bool {
    release
        .assets
        .iter()
        .any(|asset| asset.name == LATEST_MANIFEST)
}

fn select_release<'a>(
    releases: &'a [GithubRelease],
    channel: UpdateChannel,
    current: &Version,
) -> Option<(&'a GithubRelease, Version)> {
    let mut selected: Option<(&GithubRelease, Version)> = None;

    for release in releases {
        if !channel.allows(release) || !has_latest_manifest(release) {
            continue;
        }
        let Some(version) = release_version(release) else {
            continue;
        };
        if &version <= current {
            continue;
        }
        // GitHub's prerelease flag is authoritative for the channel, but a
        // beta tag accidentally published without that flag must never reach
        // the stable channel.
        if channel == UpdateChannel::Stable && !version.pre.is_empty() {
            continue;
        }
        if selected
            .as_ref()
            .is_none_or(|(_, selected_version)| &version > selected_version)
        {
            selected = Some((release, version));
        }
    }

    selected
}

async fn discover_release(
    client: &reqwest::Client,
    channel: UpdateChannel,
    current: &Version,
) -> AppResult<Option<(GithubRelease, Version)>> {
    let response = client
        .get(RELEASES_API)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| {
            AppError::Other(
                "Could not reach GitHub to check for updates. Check your connection and try again."
                    .to_string(),
            )
        })?;

    let status = response.status();
    if !status.is_success() {
        let remaining = response
            .headers()
            .get("x-ratelimit-remaining")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if status.as_u16() == 403 || status.as_u16() == 429 || remaining == "0" {
            return Err(AppError::Other(
                "GitHub's update service rate limit was reached. Please try again later."
                    .to_string(),
            ));
        }
        return Err(AppError::Other(format!(
            "GitHub release lookup failed (HTTP {}).",
            status.as_u16()
        )));
    }

    let releases: Vec<GithubRelease> = response
        .json()
        .await
        .map_err(|_| AppError::Other("GitHub returned an unreadable release list.".to_string()))?;

    Ok(select_release(&releases, channel, current)
        .map(|(release, version)| (release.clone(), version)))
}

fn release_notes(body: &str) -> Option<String> {
    let notes = body.trim();
    if notes.is_empty() {
        return None;
    }
    Some(notes.chars().take(700).collect())
}

async fn resolve_update(
    app: &AppHandle,
    client: &reqwest::Client,
    channel: &str,
) -> AppResult<Option<(UpdateCandidate, Update)>> {
    let support = support_info();
    if !support.supported {
        return Err(validation(support.message.unwrap_or_else(|| {
            "Automatic updates are not available for this build.".into()
        })));
    }

    let channel = UpdateChannel::parse(channel)?;
    let current = Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|error| AppError::Other(format!("Invalid application version: {error}")))?;
    let Some((release, version)) = discover_release(client, channel, &current).await? else {
        return Ok(None);
    };

    let endpoint = format!(
        "https://github.com/{REPOSITORY}/releases/download/{}/{}",
        release.tag_name, LATEST_MANIFEST
    );
    let endpoint = reqwest::Url::parse(&endpoint)
        .map_err(|error| AppError::Other(format!("Invalid update endpoint: {error}")))?;

    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| AppError::Other(format!("Could not prepare the update check: {error}")))?
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| AppError::Other(format!("Could not initialise the updater: {error}")))?;

    let Some(update) = updater.check().await.map_err(|error| {
        AppError::Other(format!(
            "The selected release does not contain a usable update for this system: {error}"
        ))
    })?
    else {
        return Ok(None);
    };

    let announced = Version::parse(update.version.trim_start_matches('v')).map_err(|error| {
        AppError::Other(format!(
            "The update manifest contains an invalid version: {error}"
        ))
    })?;
    if announced != version {
        return Err(AppError::Other(
            "The update manifest does not match the selected GitHub release.".to_string(),
        ));
    }

    let candidate = UpdateCandidate {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: release.body.as_deref().and_then(release_notes),
        published_at: release.published_at.clone(),
        release_url: release.html_url.clone(),
        channel: channel.as_str().to_string(),
    };

    Ok(Some((candidate, update)))
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    state: State<'_, AppState>,
    channel: String,
) -> AppResult<Option<UpdateCandidate>> {
    let _guard = begin_operation()?;
    let resolved = resolve_update(&app, &state.http, &channel).await?;
    Ok(resolved.map(|(candidate, _)| candidate))
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
    channel: String,
    version: String,
    on_event: Channel<UpdateProgress>,
) -> AppResult<UpdateInstallResult> {
    let _guard = begin_operation()?;
    let Some((candidate, update)) = resolve_update(&app, &state.http, &channel).await? else {
        return Err(validation("That update is no longer available."));
    };
    if candidate.version != version {
        return Err(validation(
            "The available update changed. Check for updates again before installing.",
        ));
    }

    let progress = |stage: &str, downloaded: u64, content_length: Option<u64>| {
        let _ = on_event.send(UpdateProgress {
            stage: stage.to_string(),
            downloaded,
            content_length,
        });
    };

    progress("started", 0, None);
    let tracked = Arc::new(Mutex::new((0u64, None)));
    let chunk_tracked = Arc::clone(&tracked);
    let finish_tracked = Arc::clone(&tracked);

    update
        .download_and_install(
            |chunk_length, total| {
                if let Ok(mut state) = chunk_tracked.lock() {
                    state.0 = state.0.saturating_add(chunk_length as u64);
                    if total.is_some() {
                        state.1 = total;
                    }
                    progress("progress", state.0, state.1);
                }
            },
            || {
                if let Ok(state) = finish_tracked.lock() {
                    progress("installing", state.0, state.1);
                }
            },
        )
        .await
        .map_err(|error| {
            AppError::Other(format!(
                "The update could not be downloaded or installed: {error}"
            ))
        })?;

    if let Ok(state) = tracked.lock() {
        progress("finished", state.0, state.1);
    }
    Ok(UpdateInstallResult {
        version: candidate.version,
        // Windows exits and relaunches through the NSIS updater. Installing an
        // AppImage replaces the file in place, so the app must be relaunched.
        restart_required: cfg!(target_os = "linux"),
    })
}

#[tauri::command]
pub fn restart_for_update(app: AppHandle) {
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, prerelease: bool, manifest: bool) -> GithubRelease {
        GithubRelease {
            tag_name: tag.into(),
            html_url: format!("https://github.com/{REPOSITORY}/releases/tag/{tag}"),
            prerelease,
            draft: false,
            body: Some("Release notes".into()),
            published_at: None,
            assets: if manifest {
                vec![GithubAsset {
                    name: LATEST_MANIFEST.into(),
                }]
            } else {
                Vec::new()
            },
        }
    }

    #[test]
    fn stable_channel_never_selects_a_prerelease() {
        let releases = vec![
            release("v2.0.0-beta.1", true, true),
            release("v2.1.0-beta.1", false, true),
            release("v1.9.0", false, true),
        ];
        let selected = select_release(&releases, UpdateChannel::Stable, &Version::new(1, 2, 3))
            .expect("stable release");
        assert_eq!(selected.0.tag_name, "v1.9.0");
    }

    #[test]
    fn prerelease_channel_selects_the_highest_eligible_release() {
        let releases = vec![
            release("v2.0.0-beta.1", true, true),
            release("v1.9.0", false, true),
        ];
        let selected = select_release(&releases, UpdateChannel::Prerelease, &Version::new(1, 2, 3))
            .expect("prerelease");
        assert_eq!(selected.0.tag_name, "v2.0.0-beta.1");
        assert_eq!(selected.1, Version::parse("2.0.0-beta.1").unwrap());
    }

    #[test]
    fn releases_without_updater_metadata_are_ignored() {
        let releases = vec![release("v2.0.0", false, false)];
        assert!(select_release(&releases, UpdateChannel::Stable, &Version::new(1, 2, 3)).is_none());
    }

    #[test]
    fn current_and_older_releases_are_not_updates() {
        let releases = vec![
            release("v1.2.3", false, true),
            release("v1.2.2", false, true),
        ];
        assert!(select_release(&releases, UpdateChannel::Stable, &Version::new(1, 2, 3)).is_none());
    }
}
