use tauri::State;

use crate::error::AppResult;
use crate::models::{DashboardData, DayActivity, SetStatistics, StatisticsData};
use crate::statistics;
use crate::AppState;

#[tauri::command]
pub async fn get_dashboard(state: State<'_, AppState>) -> AppResult<DashboardData> {
    let pool = state.db().await;
    let settings = crate::settings::load(&pool).await?;
    statistics::dashboard(&pool, settings.daily_goal).await
}

#[tauri::command]
pub async fn get_statistics(
    state: State<'_, AppState>,
    days: Option<i64>,
) -> AppResult<StatisticsData> {
    let pool = state.db().await;
    let settings = crate::settings::load(&pool).await?;
    statistics::statistics(&pool, days.unwrap_or(30), settings.daily_goal).await
}

#[tauri::command]
pub async fn get_activity_calendar(
    state: State<'_, AppState>,
    days: Option<i64>,
) -> AppResult<Vec<DayActivity>> {
    let pool = state.db().await;
    statistics::daily_activity(&pool, days.unwrap_or(120)).await
}

#[tauri::command]
pub async fn get_set_statistics(
    state: State<'_, AppState>,
    set_id: String,
) -> AppResult<SetStatistics> {
    let pool = state.db().await;
    statistics::set_statistics(&pool, &set_id).await
}
