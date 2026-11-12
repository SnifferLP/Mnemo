use std::collections::HashMap;

use sqlx::SqlitePool;

use crate::db::{new_id, now_iso};
use crate::error::{not_found, validation, AppResult};
use crate::models::{CardInput, CardProgress, Flashcard, StudyCard};
use crate::spaced_repetition::mastery;

fn validate(input: &CardInput) -> AppResult<(String, String)> {
    let front = input.front.trim().to_string();
    let back = input.back.trim().to_string();
    if front.is_empty() || back.is_empty() {
        return Err(validation("A flashcard needs text on both sides."));
    }
    if front.chars().count() > 20_000 || back.chars().count() > 20_000 {
        return Err(validation(
            "A card side is too long (max 20.000 characters).",
        ));
    }
    Ok((front, back))
}

fn empty_progress(card: &Flashcard) -> CardProgress {
    CardProgress {
        card_id: card.id.clone(),
        set_id: card.set_id.clone(),
        ease_factor: 2.5,
        interval_days: 0.0,
        repetitions: 0,
        lapses: 0,
        learning_step: 0,
        state: "new".into(),
        due_at: None,
        last_reviewed_at: None,
        correct_count: 0,
        wrong_count: 0,
        difficulty: 0.5,
        streak: 0,
    }
}

/// Makes sure every card has a progress row so SRS state is never missing.
pub async fn ensure_progress(pool: &SqlitePool, set_id: &str) -> AppResult<()> {
    sqlx::query(
        "INSERT OR IGNORE INTO card_progress (card_id, set_id)
         SELECT id, set_id FROM flashcards WHERE set_id = ?",
    )
    .bind(set_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(pool: &SqlitePool, set_id: &str) -> AppResult<Vec<StudyCard>> {
    ensure_progress(pool, set_id).await?;

    let cards: Vec<Flashcard> = sqlx::query_as(
        "SELECT * FROM flashcards WHERE set_id = ? ORDER BY position ASC, created_at ASC",
    )
    .bind(set_id)
    .fetch_all(pool)
    .await?;

    let progresses: Vec<CardProgress> =
        sqlx::query_as("SELECT * FROM card_progress WHERE set_id = ?")
            .bind(set_id)
            .fetch_all(pool)
            .await?;
    let map: HashMap<String, CardProgress> = progresses
        .into_iter()
        .map(|p| (p.card_id.clone(), p))
        .collect();

    Ok(cards
        .into_iter()
        .map(|card| {
            let progress = map
                .get(&card.id)
                .cloned()
                .unwrap_or_else(|| empty_progress(&card));
            StudyCard {
                mastery: mastery(&progress),
                progress,
                card,
            }
        })
        .collect())
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Flashcard> {
    let card: Option<Flashcard> = sqlx::query_as("SELECT * FROM flashcards WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    card.ok_or_else(|| not_found("flashcard"))
}

async fn next_position(pool: &SqlitePool, set_id: &str) -> AppResult<i64> {
    let value: Option<i64> =
        sqlx::query_scalar("SELECT MAX(position) FROM flashcards WHERE set_id = ?")
            .bind(set_id)
            .fetch_one(pool)
            .await?;
    Ok(value.unwrap_or(-1) + 1)
}

pub async fn create(pool: &SqlitePool, set_id: &str, input: &CardInput) -> AppResult<Flashcard> {
    let (front, back) = validate(input)?;
    let position = next_position(pool, set_id).await?;
    let id = new_id();
    let now = now_iso();

    sqlx::query(
        "INSERT INTO flashcards
         (id, set_id, position, front, back, explanation, hint, card_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(set_id)
    .bind(position)
    .bind(&front)
    .bind(&back)
    .bind(input.explanation.trim())
    .bind(input.hint.trim())
    .bind(
        input
            .card_type
            .clone()
            .unwrap_or_else(|| "term_definition".into()),
    )
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    sqlx::query("INSERT OR IGNORE INTO card_progress (card_id, set_id) VALUES (?, ?)")
        .bind(&id)
        .bind(set_id)
        .execute(pool)
        .await?;
    crate::services::sets::touch(pool, set_id).await?;
    get(pool, &id).await
}

pub async fn bulk_create(
    pool: &SqlitePool,
    set_id: &str,
    inputs: &[CardInput],
) -> AppResult<Vec<Flashcard>> {
    let mut position = next_position(pool, set_id).await?;
    let now = now_iso();
    let mut created = Vec::new();
    let mut tx = pool.begin().await?;

    for input in inputs {
        let (front, back) = match validate(input) {
            Ok(pair) => pair,
            Err(_) => continue,
        };
        let id = new_id();
        sqlx::query(
            "INSERT INTO flashcards
             (id, set_id, position, front, back, explanation, hint, card_type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(set_id)
        .bind(position)
        .bind(&front)
        .bind(&back)
        .bind(input.explanation.trim())
        .bind(input.hint.trim())
        .bind(input.card_type.clone().unwrap_or_else(|| "term_definition".into()))
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT OR IGNORE INTO card_progress (card_id, set_id) VALUES (?, ?)")
            .bind(&id)
            .bind(set_id)
            .execute(&mut *tx)
            .await?;
        position += 1;
        created.push(id);
    }

    tx.commit().await?;
    crate::services::sets::touch(pool, set_id).await?;

    let mut cards = Vec::new();
    for id in created {
        cards.push(get(pool, &id).await?);
    }
    Ok(cards)
}

pub async fn update(pool: &SqlitePool, id: &str, input: &CardInput) -> AppResult<Flashcard> {
    let (front, back) = validate(input)?;
    let existing = get(pool, id).await?;

    sqlx::query(
        "UPDATE flashcards SET front = ?, back = ?, explanation = ?, hint = ?,
                card_type = COALESCE(?, card_type), updated_at = ?
         WHERE id = ?",
    )
    .bind(&front)
    .bind(&back)
    .bind(input.explanation.trim())
    .bind(input.hint.trim())
    .bind(input.card_type.clone())
    .bind(now_iso())
    .bind(id)
    .execute(pool)
    .await?;

    crate::services::sets::touch(pool, &existing.set_id).await?;
    get(pool, id).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<Flashcard> {
    let card = get(pool, id).await?;
    sqlx::query("DELETE FROM flashcards WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    crate::services::sets::touch(pool, &card.set_id).await?;
    Ok(card)
}

/// Marks or unmarks one term. Star state is independent per card and is kept
/// out of the study-set timestamp on purpose, so starring a term never
/// reorders the library.
pub async fn set_starred(pool: &SqlitePool, id: &str, starred: bool) -> AppResult<Flashcard> {
    get(pool, id).await?;
    sqlx::query("UPDATE flashcards SET is_starred = ? WHERE id = ?")
        .bind(starred)
        .bind(id)
        .execute(pool)
        .await?;
    get(pool, id).await
}

pub async fn duplicate(pool: &SqlitePool, id: &str) -> AppResult<Flashcard> {
    let card = get(pool, id).await?;
    let position = next_position(pool, &card.set_id).await?;
    let new_card_id = new_id();
    let now = now_iso();

    sqlx::query(
        "INSERT INTO flashcards
         (id, set_id, position, front, back, explanation, hint, card_type, image_path, audio_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&new_card_id)
    .bind(&card.set_id)
    .bind(position)
    .bind(&card.front)
    .bind(&card.back)
    .bind(&card.explanation)
    .bind(&card.hint)
    .bind(&card.card_type)
    .bind(&card.image_path)
    .bind(&card.audio_path)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    sqlx::query("INSERT OR IGNORE INTO card_progress (card_id, set_id) VALUES (?, ?)")
        .bind(&new_card_id)
        .bind(&card.set_id)
        .execute(pool)
        .await?;
    get(pool, &new_card_id).await
}

pub async fn reorder(pool: &SqlitePool, set_id: &str, card_ids: &[String]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for (index, id) in card_ids.iter().enumerate() {
        sqlx::query("UPDATE flashcards SET position = ? WHERE id = ? AND set_id = ?")
            .bind(index as i64)
            .bind(id)
            .bind(set_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    crate::services::sets::touch(pool, set_id).await?;
    Ok(())
}

pub async fn set_media_path(
    pool: &SqlitePool,
    card_id: &str,
    kind: &str,
    path: Option<&str>,
) -> AppResult<Flashcard> {
    let column = match kind {
        "image" => "image_path",
        "audio" => "audio_path",
        _ => return Err(validation("Unknown media kind")),
    };
    sqlx::query(&format!(
        "UPDATE flashcards SET {column} = ?, updated_at = ? WHERE id = ?"
    ))
    .bind(path)
    .bind(now_iso())
    .bind(card_id)
    .execute(pool)
    .await?;
    get(pool, card_id).await
}
