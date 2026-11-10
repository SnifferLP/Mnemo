use sqlx::SqlitePool;

use crate::db::{new_id, now_iso};
use crate::error::{not_found, validation, AppResult};
use crate::import::ExtractedDoc;
use crate::models::{DocumentSummary, ImportedDocument};

const MAX_STORED_CHARS: usize = 400_000;

fn normalise_kind(kind: &str) -> &'static str {
    match kind {
        "notes" => "notes",
        _ => "material",
    }
}

pub async fn list(pool: &SqlitePool, kind: Option<String>) -> AppResult<Vec<DocumentSummary>> {
    let kind = kind.map(|k| normalise_kind(&k));
    let rows = match kind {
        Some(kind) => {
            sqlx::query_as::<_, DocumentSummary>(
                "SELECT id, title, source_name, format, char_count, kind, created_at
                 FROM imported_documents WHERE kind = ? ORDER BY created_at DESC",
            )
            .bind(kind)
            .fetch_all(pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, DocumentSummary>(
                "SELECT id, title, source_name, format, char_count, kind, created_at
                 FROM imported_documents ORDER BY created_at DESC",
            )
            .fetch_all(pool)
            .await?
        }
    };
    Ok(rows)
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<ImportedDocument> {
    let doc: Option<ImportedDocument> =
        sqlx::query_as("SELECT * FROM imported_documents WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    doc.ok_or_else(|| not_found("document"))
}

pub async fn insert(
    pool: &SqlitePool,
    doc: &ExtractedDoc,
    kind: &str,
    source_name: Option<String>,
) -> AppResult<ImportedDocument> {
    let title = if doc.title.trim().is_empty() {
        "Imported document".to_string()
    } else {
        doc.title.trim().to_string()
    };
    let content: String = doc.text.chars().take(MAX_STORED_CHARS).collect();
    if content.trim().is_empty() {
        return Err(validation("The document has no readable text."));
    }

    let id = new_id();
    sqlx::query(
        "INSERT INTO imported_documents
         (id, title, source_name, format, content, char_count, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&title)
    .bind(source_name)
    .bind(&doc.format)
    .bind(&content)
    .bind(content.chars().count() as i64)
    .bind(normalise_kind(kind))
    .bind(now_iso())
    .execute(pool)
    .await?;

    get(pool, &id).await
}

pub async fn insert_text(
    pool: &SqlitePool,
    title: &str,
    text: &str,
    kind: &str,
) -> AppResult<ImportedDocument> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(validation("Paste some text first."));
    }
    let doc = ExtractedDoc {
        title: title.trim().to_string(),
        format: "text".into(),
        text: trimmed.to_string(),
    };
    insert(pool, &doc, kind, None).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM imported_documents WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn text_for_ids(pool: &SqlitePool, ids: &[String]) -> AppResult<String> {
    let mut out = String::new();
    for id in ids {
        if let Ok(doc) = get(pool, id).await {
            out.push_str(&format!("\n\n### {}\n{}\n", doc.title, doc.content));
        }
    }
    Ok(out)
}
