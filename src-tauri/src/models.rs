use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub folder: Folder,
    pub set_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StudySet {
    pub id: String,
    pub title: String,
    pub description: String,
    pub folder_id: Option<String>,
    pub language_front: String,
    pub language_back: String,
    pub is_favorite: bool,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_studied_at: Option<String>,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StudySetSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub folder_id: Option<String>,
    pub language_front: String,
    pub language_back: String,
    pub is_favorite: bool,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_studied_at: Option<String>,
    pub archived_at: Option<String>,
    pub folder_name: Option<String>,
    pub card_count: i64,
    pub mastered_count: i64,
    pub due_count: i64,
    pub reviewed_count: i64,
    pub correct_count: i64,
    #[sqlx(skip)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Flashcard {
    pub id: String,
    pub set_id: String,
    pub position: i64,
    pub front: String,
    pub back: String,
    pub explanation: String,
    pub hint: String,
    pub card_type: String,
    pub image_path: Option<String>,
    pub audio_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CardProgress {
    pub card_id: String,
    pub set_id: String,
    pub ease_factor: f64,
    pub interval_days: f64,
    pub repetitions: i64,
    pub lapses: i64,
    pub learning_step: i64,
    pub state: String,
    pub due_at: Option<String>,
    pub last_reviewed_at: Option<String>,
    pub correct_count: i64,
    pub wrong_count: i64,
    pub difficulty: f64,
    pub streak: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyCard {
    pub card: Flashcard,
    pub progress: CardProgress,
    pub mastery: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudySetDetail {
    pub set: StudySet,
    pub cards: Vec<StudyCard>,
    pub tags: Vec<String>,
    pub folder_name: Option<String>,
    pub mastered_count: i64,
    pub due_count: i64,
}

// ---------------------------------------------------------------------------
// Sessions, tests and reviews
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StudySession {
    pub id: String,
    pub set_id: Option<String>,
    pub mode: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i64,
    pub cards_studied: i64,
    pub correct_count: i64,
    pub incorrect_count: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub id: String,
    pub set_id: String,
    pub score: f64,
    pub total: i64,
    pub duration_seconds: i64,
    pub question_types: String,
    pub details: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TestResultSummary {
    pub id: String,
    pub set_id: String,
    pub set_title: Option<String>,
    pub score: f64,
    pub total: i64,
    pub duration_seconds: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MatchingRecord {
    pub set_id: String,
    pub best_seconds: f64,
    pub pairs: i64,
    pub achieved_at: String,
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, FromRow)]
pub struct AiProviderRow {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub api_key_enc: Option<String>,
    pub temperature: f64,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Provider description that is safe to hand to the frontend (no key material).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub has_api_key: bool,
    pub temperature: f64,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub provider_id: Option<String>,
    pub set_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub source_name: Option<String>,
    pub format: String,
    pub char_count: i64,
    pub kind: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDocument {
    pub id: String,
    pub title: String,
    pub source_name: Option<String>,
    pub format: String,
    pub content: String,
    pub char_count: i64,
    pub kind: String,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Input payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CardInput {
    pub front: String,
    pub back: String,
    pub explanation: String,
    pub hint: String,
    pub card_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSetInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub language_front: Option<String>,
    #[serde(default)]
    pub language_back: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub cards: Vec<CardInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSetInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub language_front: Option<String>,
    #[serde(default)]
    pub language_back: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProviderInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    /// `None` keeps the previously stored key, `Some("")` clears it.
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCardsRequest {
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub source_text: String,
    #[serde(default)]
    pub document_ids: Vec<String>,
    #[serde(default)]
    pub set_id: Option<String>,
    pub count: usize,
    #[serde(default)]
    pub difficulty: String,
    #[serde(default)]
    pub detail_level: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub card_format: String,
    #[serde(default)]
    pub focus: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedCard {
    pub front: String,
    pub back: String,
    #[serde(default)]
    pub explanation: String,
    #[serde(default)]
    pub hint: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub set_id: Option<String>,
    pub message: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub share_set: bool,
    #[serde(default)]
    pub share_gaps: bool,
    #[serde(default)]
    pub share_history: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReply {
    pub conversation_id: String,
    pub message: ChatMessage,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicNotesRequest {
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub source_text: String,
    #[serde(default)]
    pub document_ids: Vec<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub card_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MagicNotesResult {
    pub summary: String,
    pub key_points: Vec<String>,
    pub definitions: Vec<Definition>,
    pub cards: Vec<GeneratedCard>,
    pub quiz: Vec<QuizItem>,
    pub study_guide: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Definition {
    pub term: String,
    pub definition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct QuizItem {
    pub question: String,
    pub options: Vec<String>,
    pub answer: String,
    #[serde(default)]
    pub explanation: String,
}

// ---------------------------------------------------------------------------
// Statistics payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DayActivity {
    pub date: String,
    pub reviews: i64,
    pub correct: i64,
    pub minutes: f64,
    pub cards: i64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub sets: i64,
    pub cards: i64,
    pub mastered: i64,
    pub due_today: i64,
    pub reviews_today: i64,
    pub correct_today: i64,
    pub minutes_today: f64,
    pub streak_days: i64,
    pub longest_streak: i64,
    pub studied_today: bool,
    pub accuracy_7d: f64,
    pub reviews_7d: i64,
    pub study_minutes_7d: f64,
    pub daily_goal: i64,
    pub goal_progress: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub totals: Totals,
    pub recent_sets: Vec<StudySetSummary>,
    pub continue_sets: Vec<StudySetSummary>,
    pub favorites: Vec<StudySetSummary>,
    pub reviews_due: Vec<StudySetSummary>,
    pub activity: Vec<DayActivity>,
    pub recent_tests: Vec<TestResultSummary>,
    pub recent_sessions: Vec<StudySession>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModeStat {
    pub mode: String,
    pub reviews: i64,
    pub correct: i64,
    pub minutes: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SetStat {
    pub set_id: String,
    pub title: String,
    pub cards: i64,
    pub mastered: i64,
    pub due: i64,
    pub reviews: i64,
    pub accuracy: f64,
    pub minutes: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsData {
    pub totals: Totals,
    pub daily: Vec<DayActivity>,
    pub modes: Vec<ModeStat>,
    pub sets: Vec<SetStat>,
    pub mastery_buckets: Vec<MasteryBucket>,
    pub range_days: i64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MasteryBucket {
    pub label: String,
    pub count: i64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SetStatistics {
    pub set_id: String,
    pub title: String,
    pub cards: i64,
    pub mastered: i64,
    pub learning: i64,
    pub new_cards: i64,
    pub due: i64,
    pub accuracy: f64,
    pub reviews: i64,
    pub minutes: f64,
    pub daily: Vec<DayActivity>,
    pub tests: Vec<TestResultSummary>,
    pub matching_best: Option<f64>,
    pub cards_detail: Vec<CardStat>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CardStat {
    pub card_id: String,
    pub front: String,
    pub back: String,
    pub state: String,
    pub mastery: f64,
    pub correct: i64,
    pub wrong: i64,
    pub interval_days: f64,
    pub due_at: Option<String>,
}
