use std::collections::HashMap;

use sqlx::SqlitePool;

use crate::db::{new_id, now_iso};
use crate::error::{not_found, validation, AppResult};
use crate::models::{
    CreateSetInput, StudySet, StudySetDetail, StudySetSummary, Tag, UpdateSetInput,
};
use crate::services::cards;

pub async fn list_summaries(
    pool: &SqlitePool,
    search: Option<String>,
    folder_id: Option<String>,
    tag_id: Option<String>,
    favorites_only: bool,
    archived_only: bool,
    sort: &str,
) -> AppResult<Vec<StudySetSummary>> {
    let now = now_iso();
    let mut sql = String::from(
        "SELECT s.id, s.title, s.description, s.folder_id, s.language_front, s.language_back,
                s.is_favorite, s.source, s.created_at, s.updated_at, s.last_studied_at,
                s.archived_at, f.name AS folder_name,
                (SELECT COUNT(*) FROM flashcards c WHERE c.set_id = s.id) AS card_count,
                (SELECT COUNT(*) FROM card_progress p WHERE p.set_id = s.id
                    AND p.interval_days >= 21 AND p.correct_count >= 2) AS mastered_count,
                (SELECT COUNT(*) FROM card_progress p WHERE p.set_id = s.id AND p.state <> 'new'
                    AND p.due_at IS NOT NULL AND p.due_at <= ?) AS due_count,
                (SELECT COUNT(*) FROM card_reviews r WHERE r.set_id = s.id) AS reviewed_count,
                (SELECT COUNT(*) FROM card_reviews r WHERE r.set_id = s.id AND r.outcome = 'correct') AS correct_count
         FROM study_sets s
         LEFT JOIN folders f ON f.id = s.folder_id
         WHERE 1 = 1",
    );
    let mut binds: Vec<String> = vec![now];

    if let Some(query) = search.filter(|q| !q.trim().is_empty()) {
        let needle = format!("%{}%", query.trim().replace('%', ""));
        sql.push_str(
            " AND (s.title LIKE ? COLLATE NOCASE OR s.description LIKE ? COLLATE NOCASE
              OR EXISTS (SELECT 1 FROM flashcards fc WHERE fc.set_id = s.id
                    AND (fc.front LIKE ? COLLATE NOCASE OR fc.back LIKE ? COLLATE NOCASE)))",
        );
        for _ in 0..4 {
            binds.push(needle.clone());
        }
    }
    if let Some(folder) = folder_id {
        sql.push_str(" AND s.folder_id = ?");
        binds.push(folder);
    }
    if let Some(tag) = tag_id {
        sql.push_str(
            " AND EXISTS (SELECT 1 FROM study_set_tags st WHERE st.set_id = s.id AND st.tag_id = ?)",
        );
        binds.push(tag);
    }
    if favorites_only {
        sql.push_str(" AND s.is_favorite = ?");
        binds.push("1".into());
    }
    sql.push_str(if archived_only {
        " AND s.archived_at IS NOT NULL"
    } else {
        " AND s.archived_at IS NULL"
    });

    let order = match sort {
        "title" => "s.title COLLATE NOCASE ASC",
        "created" => "s.created_at DESC",
        "studied" => "s.last_studied_at IS NULL, s.last_studied_at DESC",
        "cards" => "card_count DESC, s.title COLLATE NOCASE ASC",
        "progress" => "mastered_count DESC, s.title COLLATE NOCASE ASC",
        _ => "s.updated_at DESC",
    };
    sql.push_str(&format!(" ORDER BY {order}"));

    let mut query = sqlx::query_as::<_, StudySetSummary>(&sql);
    for value in &binds {
        query = query.bind(value.clone());
    }
    let mut rows = query.fetch_all(pool).await?;

    // Attach tags with one extra query instead of N+1 lookups.
    let tag_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT st.set_id, t.name FROM study_set_tags st
         JOIN tags t ON t.id = st.tag_id ORDER BY t.name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    let mut by_set: HashMap<String, Vec<String>> = HashMap::new();
    for (set_id, name) in tag_rows {
        by_set.entry(set_id).or_default().push(name);
    }
    for row in rows.iter_mut() {
        row.tags = by_set.remove(&row.id).unwrap_or_default();
    }

    Ok(rows)
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<StudySet> {
    let set: Option<StudySet> = sqlx::query_as("SELECT * FROM study_sets WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    set.ok_or_else(|| not_found("study set"))
}

/// Returns a set only while it is in the active library. Learning commands use
/// this guard so an archived set cannot enter a queue, review or test by URL.
pub async fn ensure_active(pool: &SqlitePool, id: &str) -> AppResult<StudySet> {
    let set = get(pool, id).await?;
    if set.archived_at.is_some() {
        return Err(validation(
            "This study set is archived. Restore it before studying.",
        ));
    }
    Ok(set)
}

pub async fn set_archived(pool: &SqlitePool, id: &str, archived: bool) -> AppResult<()> {
    get(pool, id).await?;
    let now = now_iso();
    sqlx::query("UPDATE study_sets SET archived_at = ?, updated_at = ? WHERE id = ?")
        .bind(if archived { Some(now) } else { None })
        .bind(now_iso())
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn detail(pool: &SqlitePool, id: &str) -> AppResult<StudySetDetail> {
    let set = get(pool, id).await?;
    let cards = cards::list(pool, id).await?;

    let tags: Vec<(String,)> = sqlx::query_as(
        "SELECT t.name FROM study_set_tags st JOIN tags t ON t.id = st.tag_id
         WHERE st.set_id = ? ORDER BY t.name COLLATE NOCASE",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let folder_name: Option<String> = match &set.folder_id {
        Some(folder_id) => {
            sqlx::query_scalar("SELECT name FROM folders WHERE id = ?")
                .bind(folder_id)
                .fetch_optional(pool)
                .await?
        }
        None => None,
    };

    let mastered_count = cards
        .iter()
        .filter(|c| c.progress.interval_days >= 21.0 && c.progress.correct_count >= 2)
        .count() as i64;
    let due_count = cards
        .iter()
        .filter(|c| {
            c.progress.state != "new"
                && c.progress
                    .due_at
                    .as_deref()
                    .map(|d| d <= now_iso().as_str())
                    .unwrap_or(false)
        })
        .count() as i64;

    Ok(StudySetDetail {
        set,
        cards,
        tags: tags.into_iter().map(|(name,)| name).collect(),
        folder_name,
        mastered_count,
        due_count,
    })
}

async fn validate_folder(pool: &SqlitePool, folder_id: &Option<String>) -> AppResult<()> {
    if let Some(folder) = folder_id {
        let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM folders WHERE id = ?")
            .bind(folder)
            .fetch_optional(pool)
            .await?;
        if exists.is_none() {
            return Err(not_found("folder"));
        }
    }
    Ok(())
}

pub async fn create(pool: &SqlitePool, input: CreateSetInput) -> AppResult<StudySetDetail> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err(validation("Give the study set a title."));
    }
    if title.chars().count() > 180 {
        return Err(validation("The title is too long (max 180 characters)."));
    }
    validate_folder(pool, &input.folder_id).await?;

    let id = new_id();
    let now = now_iso();
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO study_sets
         (id, title, description, folder_id, language_front, language_back, is_favorite, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&title)
    .bind(input.description.trim())
    .bind(&input.folder_id)
    .bind(input.language_front.unwrap_or_else(|| "English".into()))
    .bind(input.language_back.unwrap_or_else(|| "English".into()))
    .bind(input.source.unwrap_or_else(|| "manual".into()))
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    let mut position = 0i64;
    for card in &input.cards {
        if card.front.trim().is_empty() || card.back.trim().is_empty() {
            continue;
        }
        let card_id = new_id();
        sqlx::query(
            "INSERT INTO flashcards
             (id, set_id, position, front, back, explanation, hint, card_type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&card_id)
        .bind(&id)
        .bind(position)
        .bind(card.front.trim())
        .bind(card.back.trim())
        .bind(card.explanation.trim())
        .bind(card.hint.trim())
        .bind(card.card_type.clone().unwrap_or_else(|| "term_definition".into()))
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT OR IGNORE INTO card_progress (card_id, set_id) VALUES (?, ?)")
            .bind(&card_id)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        position += 1;
    }

    link_tags(&mut tx, &id, &input.tags).await?;
    tx.commit().await?;

    detail(pool, &id).await
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    input: UpdateSetInput,
) -> AppResult<StudySetDetail> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err(validation("Give the study set a title."));
    }
    validate_folder(pool, &input.folder_id).await?;
    get(pool, id).await?;

    sqlx::query(
        "UPDATE study_sets SET title = ?, description = ?, folder_id = ?,
                language_front = COALESCE(?, language_front),
                language_back = COALESCE(?, language_back),
                updated_at = ?
         WHERE id = ?",
    )
    .bind(title)
    .bind(input.description.trim())
    .bind(&input.folder_id)
    .bind(&input.language_front)
    .bind(&input.language_back)
    .bind(now_iso())
    .bind(id)
    .execute(pool)
    .await?;

    detail(pool, id).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    // Reviews are deleted explicitly so old databases that predate the cascade
    // foreign keys cannot leave orphaned history behind.
    sqlx::query("DELETE FROM card_reviews WHERE set_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    let result = sqlx::query("DELETE FROM study_sets WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found("study set"));
    }
    tx.commit().await?;
    Ok(())
}

pub async fn duplicate(pool: &SqlitePool, id: &str) -> AppResult<StudySetDetail> {
    let source = get(pool, id).await?;
    let source_cards = cards::list(pool, id).await?;
    let new_set_id = new_id();
    let now = now_iso();

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO study_sets
         (id, title, description, folder_id, language_front, language_back, is_favorite, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
    )
    .bind(&new_set_id)
    .bind(format!("{} (copy)", source.title))
    .bind(&source.description)
    .bind(&source.folder_id)
    .bind(&source.language_front)
    .bind(&source.language_back)
    .bind(&source.source)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    for (index, study_card) in source_cards.iter().enumerate() {
        let card_id = new_id();
        sqlx::query(
            "INSERT INTO flashcards
             (id, set_id, position, front, back, explanation, hint, card_type, image_path, audio_path, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&card_id)
        .bind(&new_set_id)
        .bind(index as i64)
        .bind(&study_card.card.front)
        .bind(&study_card.card.back)
        .bind(&study_card.card.explanation)
        .bind(&study_card.card.hint)
        .bind(&study_card.card.card_type)
        .bind(&study_card.card.image_path)
        .bind(&study_card.card.audio_path)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT OR IGNORE INTO card_progress (card_id, set_id) VALUES (?, ?)")
            .bind(&card_id)
            .bind(&new_set_id)
            .execute(&mut *tx)
            .await?;
    }

    let tags: Vec<(String,)> = sqlx::query_as(
        "SELECT t.name FROM study_set_tags st JOIN tags t ON t.id = st.tag_id WHERE st.set_id = ?",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    let tag_names: Vec<String> = tags.into_iter().map(|(name,)| name).collect();
    link_tags(&mut tx, &new_set_id, &tag_names).await?;

    tx.commit().await?;
    detail(pool, &new_set_id).await
}

async fn link_tags(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    set_id: &str,
    tags: &[String],
) -> AppResult<()> {
    for raw in tags {
        let name = raw.trim();
        if name.is_empty() || name.chars().count() > 40 {
            continue;
        }
        let existing: Option<(String,)> =
            sqlx::query_as("SELECT id FROM tags WHERE name = ? COLLATE NOCASE")
                .bind(name)
                .fetch_optional(&mut **tx)
                .await?;
        let tag_id = match existing {
            Some((id,)) => id,
            None => {
                let id = new_id();
                sqlx::query("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)")
                    .bind(&id)
                    .bind(name)
                    .bind(pick_color(name))
                    .bind(now_iso())
                    .execute(&mut **tx)
                    .await?;
                id
            }
        };
        sqlx::query("INSERT OR IGNORE INTO study_set_tags (set_id, tag_id) VALUES (?, ?)")
            .bind(set_id)
            .bind(tag_id)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

pub fn pick_color(seed: &str) -> &'static str {
    const COLORS: [&str; 7] = [
        "#8b5cf6", "#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#60a5fa", "#fb7185",
    ];
    let hash: u32 = seed.bytes().map(|b| b as u32).sum::<u32>() % COLORS.len() as u32;
    COLORS[hash as usize]
}

pub async fn set_tags(pool: &SqlitePool, id: &str, tags: &[String]) -> AppResult<Vec<String>> {
    get(pool, id).await?;
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM study_set_tags WHERE set_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    link_tags(&mut tx, id, tags).await?;
    sqlx::query("UPDATE study_sets SET updated_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT t.name FROM study_set_tags st JOIN tags t ON t.id = st.tag_id
         WHERE st.set_id = ? ORDER BY t.name COLLATE NOCASE",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(name,)| name).collect())
}

pub async fn list_tags(pool: &SqlitePool) -> AppResult<Vec<Tag>> {
    let tags = sqlx::query_as::<_, Tag>(
        "SELECT id, name, color, created_at FROM tags ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    Ok(tags)
}

pub async fn delete_tag(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn touch(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("UPDATE study_sets SET updated_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
