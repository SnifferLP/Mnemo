use sqlx::SqlitePool;

use crate::ai::ProviderConfig;
use crate::crypto::KeyVault;
use crate::db::{new_id, now_iso};
use crate::error::{not_found, validation, AppResult};
use crate::models::{AiProviderInfo, AiProviderRow, SaveProviderInput};

pub fn to_info(row: AiProviderRow) -> AiProviderInfo {
    AiProviderInfo {
        id: row.id,
        name: row.name,
        kind: row.kind,
        base_url: row.base_url,
        model: row.model,
        has_api_key: row.api_key_enc.map(|k| !k.is_empty()).unwrap_or(false),
        temperature: row.temperature,
        is_default: row.is_default,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<AiProviderInfo>> {
    let rows: Vec<AiProviderRow> =
        sqlx::query_as("SELECT * FROM ai_providers ORDER BY is_default DESC, name COLLATE NOCASE")
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(to_info).collect())
}

async fn row_by_id(pool: &SqlitePool, id: &str) -> AppResult<AiProviderRow> {
    let row: Option<AiProviderRow> = sqlx::query_as("SELECT * FROM ai_providers WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    row.ok_or_else(|| not_found("AI provider"))
}

pub async fn save(
    pool: &SqlitePool,
    vault: &KeyVault,
    input: SaveProviderInput,
) -> AppResult<AiProviderInfo> {
    let name = input.name.trim().to_string();
    let base_url = input.base_url.trim().to_string();
    let model = input.model.trim().to_string();

    if name.is_empty() {
        return Err(validation("Give the provider a name."));
    }
    if model.is_empty() {
        return Err(validation("Enter the model name, e.g. gpt-4o-mini."));
    }
    if base_url.is_empty() {
        return Err(validation("Enter the API base URL."));
    }
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err(validation(
            "The base URL must start with http:// or https://",
        ));
    }

    let kind = match input.kind.as_str() {
        "openai" | "openrouter" | "mistral" | "gemini" | "ollama" | "custom" => input.kind.clone(),
        _ => "custom".to_string(),
    };

    let encrypted = match input.api_key.as_deref() {
        Some(key) if key.trim().is_empty() => Some(None),
        Some(key) => Some(Some(vault.encrypt(key.trim())?)),
        None => None,
    };

    let now = now_iso();
    let id = match input.id {
        Some(id) => {
            let existing = row_by_id(pool, &id).await?;
            let key_value = match &encrypted {
                Some(None) => None,
                Some(Some(value)) => Some(value.clone()),
                None => existing.api_key_enc,
            };
            sqlx::query(
                "UPDATE ai_providers SET name = ?, kind = ?, base_url = ?, model = ?,
                        api_key_enc = ?, temperature = ?, updated_at = ? WHERE id = ?",
            )
            .bind(&name)
            .bind(&kind)
            .bind(&base_url)
            .bind(&model)
            .bind(key_value)
            .bind(
                input
                    .temperature
                    .unwrap_or(existing.temperature)
                    .clamp(0.0, 2.0),
            )
            .bind(&now)
            .bind(&id)
            .execute(pool)
            .await?;
            id
        }
        None => {
            let id = new_id();
            let key_value = match encrypted {
                Some(Some(value)) => Some(value),
                _ => None,
            };
            sqlx::query(
                "INSERT INTO ai_providers
                 (id, name, kind, base_url, model, api_key_enc, temperature, is_default, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
            )
            .bind(&id)
            .bind(&name)
            .bind(&kind)
            .bind(&base_url)
            .bind(&model)
            .bind(key_value)
            .bind(input.temperature.unwrap_or(0.7).clamp(0.0, 2.0))
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await?;
            id
        }
    };

    if input.is_default {
        set_default(pool, &id).await?;
    }

    let row = row_by_id(pool, &id).await?;
    Ok(to_info(row))
}

pub async fn set_default(pool: &SqlitePool, id: &str) -> AppResult<()> {
    row_by_id(pool, id).await?;
    sqlx::query("UPDATE ai_providers SET is_default = 0, updated_at = ?")
        .bind(now_iso())
        .execute(pool)
        .await?;
    sqlx::query("UPDATE ai_providers SET is_default = 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM ai_providers WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Resolves a provider for a request, falling back to the default provider.
pub async fn resolve(
    pool: &SqlitePool,
    vault: &KeyVault,
    requested: Option<&str>,
) -> AppResult<(AiProviderRow, ProviderConfig)> {
    let row = match requested.filter(|id| !id.is_empty()) {
        Some(id) => row_by_id(pool, id).await?,
        None => {
            let row: Option<AiProviderRow> = sqlx::query_as(
                "SELECT * FROM ai_providers ORDER BY is_default DESC, created_at ASC LIMIT 1",
            )
            .fetch_optional(pool)
            .await?;
            row.ok_or_else(|| {
                validation("No AI provider is configured yet. Add one in Settings → AI.")
            })?
        }
    };

    let api_key = match row.api_key_enc.as_deref() {
        Some(value) if !value.is_empty() => Some(vault.decrypt(value)?),
        _ => None,
    };

    if api_key.is_none() && row.kind != "ollama" {
        return Err(validation(format!(
            "The provider \"{}\" has no API key. Add one in Settings → AI.",
            row.name
        )));
    }

    let config = ProviderConfig {
        kind: row.kind.clone(),
        base_url: row.base_url.clone(),
        model: row.model.clone(),
        api_key,
        temperature: row.temperature,
    };
    Ok((row, config))
}
