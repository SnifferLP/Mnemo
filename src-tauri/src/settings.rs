use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::AppResult;

const SETTINGS_KEY: &str = "app";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// "dark" | "light" | "system"
    pub theme: String,
    pub accent: String,
    /// "editorial" | "modern"
    pub display_font: String,
    /// "en" | "de"
    pub language: String,
    pub display_name: String,
    pub daily_goal: i64,
    pub daily_goal_minutes: i64,
    pub new_cards_per_session: i64,
    pub answer_case_sensitive: bool,
    /// 0 = exact match, 1 = small typos allowed, 2 = fuzzy.
    pub answer_tolerance: i64,
    pub ai_grading_enabled: bool,
    pub default_provider_id: Option<String>,
    pub ai_share_set: bool,
    pub ai_share_gaps: bool,
    pub ai_share_history: bool,
    pub ai_card_batch: i64,
    pub sidebar_collapsed: bool,
    pub shuffle_cards: bool,
    pub animations: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            accent: "ember".into(),
            display_font: "editorial".into(),
            language: "en".into(),
            display_name: String::new(),
            daily_goal: 30,
            daily_goal_minutes: 20,
            new_cards_per_session: 20,
            answer_case_sensitive: false,
            answer_tolerance: 1,
            ai_grading_enabled: false,
            default_provider_id: None,
            ai_share_set: true,
            ai_share_gaps: true,
            ai_share_history: true,
            ai_card_batch: 12,
            sidebar_collapsed: false,
            shuffle_cards: false,
            animations: true,
        }
    }
}

impl AppSettings {
    fn sanitised(mut self) -> Self {
        if !["dark", "light", "system"].contains(&self.theme.as_str()) {
            self.theme = "dark".into();
        }
        if !["editorial", "modern"].contains(&self.display_font.as_str()) {
            self.display_font = "editorial".into();
        }
        if !["en", "de"].contains(&self.language.as_str()) {
            self.language = "en".into();
        }
        self.daily_goal = self.daily_goal.clamp(1, 1000);
        self.daily_goal_minutes = self.daily_goal_minutes.clamp(1, 600);
        self.new_cards_per_session = self.new_cards_per_session.clamp(3, 200);
        self.answer_tolerance = self.answer_tolerance.clamp(0, 2);
        self.ai_card_batch = self.ai_card_batch.clamp(3, 60);
        if self.display_name.len() > 60 {
            self.display_name.truncate(60);
        }
        self
    }
}

pub async fn load(pool: &SqlitePool) -> AppResult<AppSettings> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
        .bind(SETTINGS_KEY)
        .fetch_optional(pool)
        .await?;

    match row {
        Some((json,)) => Ok(serde_json::from_str::<AppSettings>(&json)
            .unwrap_or_default()
            .sanitised()),
        None => Ok(AppSettings::default()),
    }
}

pub async fn save(pool: &SqlitePool, settings: &AppSettings) -> AppResult<AppSettings> {
    let settings = settings.clone().sanitised();
    let json = serde_json::to_string(&settings)?;
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(SETTINGS_KEY)
    .bind(json)
    .execute(pool)
    .await?;
    Ok(settings)
}
