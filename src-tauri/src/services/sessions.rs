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
    sqlx::query(
        "UPDATE study_sessions SET ended_at = ?, cards_studied = ?, correct_count = ?,
                incorrect_count = ?, duration_seconds = ? WHERE id = ?",
    )
    .bind(now_iso())
    .bind(cards_studied.max(0))
    .bind(correct.max(0))
    .bind(incorrect.max(0))
    .bind(duration_seconds.max(0))
    .bind(session_id)
    .execute(pool)
    .await?;

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

pub async fn reset_set(pool: &SqlitePool, set_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM card_progress WHERE set_id = ?")
        .bind(set_id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM card_reviews WHERE set_id = ?")
        .bind(set_id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM test_results WHERE set_id = ?")
        .bind(set_id)
        .execute(pool)
        .await?;
    cards::ensure_progress(pool, set_id).await?;
    Ok(())
}
