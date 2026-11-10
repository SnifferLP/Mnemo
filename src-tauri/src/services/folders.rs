use sqlx::SqlitePool;

use crate::db::{new_id, now_iso};
use crate::error::{not_found, validation, AppResult};
use crate::models::{Folder, FolderNode};

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<FolderNode>> {
    let folders: Vec<Folder> =
        sqlx::query_as("SELECT * FROM folders ORDER BY position ASC, name COLLATE NOCASE")
            .fetch_all(pool)
            .await?;

    let counts: Vec<(Option<String>, i64)> =
        sqlx::query_as("SELECT folder_id, COUNT(*) FROM study_sets GROUP BY folder_id")
            .fetch_all(pool)
            .await?;
    let mut by_folder = std::collections::HashMap::new();
    for (folder_id, count) in counts {
        if let Some(id) = folder_id {
            by_folder.insert(id, count);
        }
    }

    Ok(folders
        .into_iter()
        .map(|folder| FolderNode {
            set_count: *by_folder.get(&folder.id).unwrap_or(&0),
            folder,
        })
        .collect())
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    parent_id: Option<String>,
    color: Option<String>,
) -> AppResult<Folder> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(validation("Give the folder a name."));
    }
    if name.chars().count() > 80 {
        return Err(validation("Folder names are limited to 80 characters."));
    }
    if let Some(parent) = &parent_id {
        let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM folders WHERE id = ?")
            .bind(parent)
            .fetch_optional(pool)
            .await?;
        if exists.is_none() {
            return Err(not_found("parent folder"));
        }
    }

    let duplicate: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM folders WHERE name = ? COLLATE NOCASE AND
            ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)",
    )
    .bind(&name)
    .bind(&parent_id)
    .bind(&parent_id)
    .fetch_optional(pool)
    .await?;
    if duplicate.is_some() {
        return Err(validation("A folder with that name already exists here."));
    }

    let position: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(position) FROM folders WHERE (parent_id IS NULL AND ? IS NULL) OR parent_id = ?",
    )
    .bind(&parent_id)
    .bind(&parent_id)
    .fetch_one(pool)
    .await?;

    let id = new_id();
    let now = now_iso();
    sqlx::query(
        "INSERT INTO folders (id, name, parent_id, color, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&parent_id)
    .bind(color)
    .bind(position.unwrap_or(-1) + 1)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Folder> {
    let folder: Option<Folder> = sqlx::query_as("SELECT * FROM folders WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    folder.ok_or_else(|| not_found("folder"))
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    name: Option<String>,
    color: Option<String>,
) -> AppResult<Folder> {
    let folder = get(pool, id).await?;
    let new_name = match name {
        Some(name) => {
            let trimmed = name.trim().to_string();
            if trimmed.is_empty() {
                return Err(validation("Give the folder a name."));
            }
            if trimmed.chars().count() > 80 {
                return Err(validation("Folder names are limited to 80 characters."));
            }
            trimmed
        }
        None => folder.name.clone(),
    };

    let duplicate: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM folders WHERE name = ? COLLATE NOCASE AND id <> ? AND
            ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)",
    )
    .bind(&new_name)
    .bind(id)
    .bind(&folder.parent_id)
    .bind(&folder.parent_id)
    .fetch_optional(pool)
    .await?;
    if duplicate.is_some() {
        return Err(validation("A folder with that name already exists here."));
    }

    sqlx::query(
        "UPDATE folders SET name = ?, color = COALESCE(?, color), updated_at = ? WHERE id = ?",
    )
    .bind(&new_name)
    .bind(color)
    .bind(now_iso())
    .bind(id)
    .execute(pool)
    .await?;

    get(pool, id).await
}

pub async fn move_folder(
    pool: &SqlitePool,
    id: &str,
    parent_id: Option<String>,
) -> AppResult<Folder> {
    let folder = get(pool, id).await?;
    if let Some(target) = &parent_id {
        if target == id {
            return Err(validation("A folder cannot contain itself."));
        }
        // Walk up from the target to detect cycles.
        let mut cursor = Some(target.clone());
        let mut guard = 0;
        while let Some(current) = cursor {
            if current == folder.id {
                return Err(validation(
                    "A folder cannot be moved into one of its own subfolders.",
                ));
            }
            guard += 1;
            if guard > 64 {
                break;
            }
            cursor = sqlx::query_scalar::<_, Option<String>>(
                "SELECT parent_id FROM folders WHERE id = ?",
            )
            .bind(current)
            .fetch_optional(pool)
            .await?
            .flatten();
        }
    }

    sqlx::query("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?")
        .bind(&parent_id)
        .bind(now_iso())
        .bind(id)
        .execute(pool)
        .await?;
    get(pool, id).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM folders WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found("folder"));
    }
    Ok(())
}
