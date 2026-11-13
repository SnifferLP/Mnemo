use chrono::{Local, NaiveDate};
use sqlx::SqlitePool;

use crate::db::{new_id, now_iso};
use crate::error::{not_found, AppResult};
use crate::models::{CardProgress, Flashcard, StudySession};
use crate::services::cards;
use crate::spaced_repetition::{apply_review, Outcome};

pub async fn start(pool: &SqlitePool, set_id: Option<String>, mode: &str) -> AppResult<String> {
    let id = new_id();
    sqlx::query("INSERT INTO study_sessions (id, set_id, mode, started_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&set_id)
        .bind(mode)
        .bind(now_iso())
        .execute(pool)
        .await?;
    Ok(id)
}

pub async fn finish(
    pool: &SqlitePool,
    session_id: &str,
    cards_studied: i64,
    correct: i64,
    incorrect: i64,
    duration_seconds: i64,
) -> AppResult<StudySession> {
    let cards_studied = cards_studied.max(0);
    let duration_seconds = duration_seconds.max(0);
    sqlx::query(
        "UPDATE study_sessions SET ended_at = ?, cards_studied = ?, correct_count = ?,
                incorrect_count = ?, duration_seconds = ? WHERE id = ?",
    )
    .bind(now_iso())
    .bind(cards_studied)
    .bind(correct.max(0))
    .bind(incorrect.max(0))
    .bind(duration_seconds)
    .bind(session_id)
    .execute(pool)
    .await?;

    if cards_studied > 0 {
        record_learning_today(pool).await?;
    }

    let session: Option<StudySession> = sqlx::query_as("SELECT * FROM study_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(pool)
        .await?;
    session.ok_or_else(|| not_found("session"))
}

/// Applies an SM-2 review, records the review event and returns new state.
pub async fn record_review(
    pool: &SqlitePool,
    card_id: &str,
    outcome: Outcome,
    mode: &str,
    duration_ms: i64,
) -> AppResult<CardProgress> {
    let card: Flashcard = cards::get(pool, card_id).await?;
    sqlx::query("INSERT OR IGNORE INTO card_progress (card_id, set_id) VALUES (?, ?)")
        .bind(&card.id)
        .bind(&card.set_id)
        .execute(pool)
        .await?;

    let mut progress: CardProgress =
        sqlx::query_as("SELECT * FROM card_progress WHERE card_id = ?")
            .bind(card_id)
            .fetch_one(pool)
            .await?;

    apply_review(&mut progress, outcome, chrono::Utc::now());

    sqlx::query(
        "UPDATE card_progress SET ease_factor = ?, interval_days = ?, repetitions = ?,
                lapses = ?, learning_step = ?, state = ?, due_at = ?, last_reviewed_at = ?,
                correct_count = ?, wrong_count = ?, difficulty = ?, streak = ?
         WHERE card_id = ?",
    )
    .bind(progress.ease_factor)
    .bind(progress.interval_days)
    .bind(progress.repetitions)
    .bind(progress.lapses)
    .bind(progress.learning_step)
    .bind(&progress.state)
    .bind(&progress.due_at)
    .bind(&progress.last_reviewed_at)
    .bind(progress.correct_count)
    .bind(progress.wrong_count)
    .bind(progress.difficulty)
    .bind(progress.streak)
    .bind(card_id)
    .execute(pool)
    .await?;

    record_learning_today(pool).await?;

    sqlx::query(
        "INSERT INTO card_reviews (card_id, set_id, mode, rating, outcome, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(card_id)
    .bind(&card.set_id)
    .bind(mode)
    .bind(outcome.quality())
    .bind(outcome.as_str())
    .bind(duration_ms.clamp(0, 3_600_000))
    .bind(now_iso())
    .execute(pool)
    .await?;

    sqlx::query("UPDATE study_sets SET last_studied_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(&card.set_id)
        .execute(pool)
        .await?;

    Ok(progress)
}

/// Resets the learning progress of a single study set.
///
/// Current progress is what gets reset: the SM-2 state of the set's cards and
/// its test progress. Reviews and sessions are the historical record — they
/// feed the set's own "Last 30 Days" history as much as the dashboard, the
/// daily chart, the accuracy and the streak — so they are only ever flagged
/// `hidden_by_reset` where a reset is meant to hide them (tests), never
/// deleted. The set therefore starts at zero progress while its learning
/// history stays readable.
pub async fn reset_set(pool: &SqlitePool, set_id: &str) -> AppResult<()> {
    let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM study_sets WHERE id = ?")
        .bind(set_id)
        .fetch_optional(pool)
        .await?;
    if existing.is_none() {
        return Err(not_found("study set"));
    }

    sqlx::query("UPDATE test_results SET hidden_by_reset = 1 WHERE set_id = ?")
        .bind(set_id)
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM card_progress WHERE set_id = ?")
        .bind(set_id)
        .execute(pool)
        .await?;
    cards::ensure_progress(pool, set_id).await?;
    Ok(())
}

/// Records one local calendar day. The primary key makes repeated reviews and
/// sessions on the same day idempotent. The ledger intentionally has no study
/// set foreign key, so history survives deleting or archiving a set.
pub async fn record_learning_day(pool: &SqlitePool, day: NaiveDate) -> AppResult<()> {
    sqlx::query("INSERT OR IGNORE INTO learning_days (day, first_recorded_at) VALUES (?, ?)")
        .bind(day.to_string())
        .bind(now_iso())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn record_learning_today(pool: &SqlitePool) -> AppResult<()> {
    record_learning_day(pool, Local::now().date_naive()).await
}
