use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::settings::{self, AppSettings};
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub db_path: String,
    pub media_dir: String,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    let pool = state.db().await;
    settings::load(&pool).await
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    let pool = state.db().await;
    settings::save(&pool, &settings).await
}

#[tauri::command]
pub async fn app_info(state: State<'_, AppState>) -> AppResult<AppInfo> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        media_dir: state.data_dir.join("media").to_string_lossy().to_string(),
    })
}
