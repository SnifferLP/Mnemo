use std::path::Path;

use tauri::State;

use crate::error::{validation, AppResult};
use crate::models::{CreateSetInput, StudySetDetail};
use crate::services::{cards, sets};
use crate::AppState;

const MAX_IMPORT_BYTES: u64 = 40 * 1024 * 1024;

#[tauri::command]
pub async fn import_study_set_file(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<StudySetDetail> {
    let file_path = Path::new(&path);
    let meta =
        std::fs::metadata(file_path).map_err(|_| validation("That file could not be read."))?;
    if meta.len() > MAX_IMPORT_BYTES {
        return Err(validation("The file is too large to import."));
    }

    let bytes = std::fs::read(file_path)?;
    let text = String::from_utf8_lossy(&bytes);
    let format = crate::import::detect_format(&path);
    let fallback_title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported set")
        .to_string();

    let parsed = crate::import::parse_text(&text, &format, &fallback_title)?;
    let pool = state.db().await;
    sets::create(
        &pool,
        CreateSetInput {
            title: parsed.title,
            description: String::new(),
            folder_id: None,
            language_front: None,
            language_back: None,
            source: Some("import".into()),
            tags: vec![],
            cards: parsed.cards,
        },
    )
    .await
}

#[tauri::command]
pub async fn import_study_set_text(
    state: State<'_, AppState>,
    text: String,
    format: String,
    title: String,
) -> AppResult<StudySetDetail> {
    let parsed = crate::import::parse_text(&text, &format, &title)?;
    let pool = state.db().await;
    sets::create(
        &pool,
        CreateSetInput {
            title: parsed.title,
            description: String::new(),
            folder_id: None,
            language_front: None,
            language_back: None,
            source: Some("import".into()),
            tags: vec![],
            cards: parsed.cards,
        },
    )
    .await
}

#[tauri::command]
pub async fn export_study_set(
    state: State<'_, AppState>,
    set_id: String,
    format: String,
    path: String,
) -> AppResult<String> {
    let pool = state.db().await;
    let detail = sets::detail(&pool, &set_id).await?;
    let plain: Vec<_> = detail.cards.iter().map(|c| c.card.clone()).collect();
    let format = format.to_lowercase();

    match format.as_str() {
        "pdf" => {
            let bytes = crate::export::to_pdf(&detail.set, &plain);
            std::fs::write(&path, bytes)?;
        }
        "csv" => {
            std::fs::write(&path, crate::export::to_csv(&detail.set, &plain))?;
        }
        "tsv" => {
            std::fs::write(&path, crate::export::to_tsv(&detail.set, &plain))?;
        }
        "json" => {
            std::fs::write(
                &path,
                crate::export::to_json(&detail.set, &plain, &detail.tags),
            )?;
        }
        "markdown" | "md" => {
            std::fs::write(
                &path,
                crate::export::to_markdown(&detail.set, &plain, &detail.tags),
            )?;
        }
        other => return Err(validation(format!("Unsupported export format: {other}"))),
    }

    let _ = cards::ensure_progress(&pool, &set_id).await;
    Ok(path)
}

#[tauri::command]
pub async fn backup_database(state: State<'_, AppState>, path: String) -> AppResult<String> {
    let pool = state.db().await;
    crate::db::checkpoint(&pool).await?;

    let backup_dir = state.data_dir.join("backups");
    std::fs::create_dir_all(&backup_dir)?;
    let temp = backup_dir.join(format!("mnemo-{}.db", crate::db::new_id()));

    // `VACUUM INTO` needs a literal path; the name is generated locally so no
    // user input ever reaches the SQL statement.
    let literal = temp.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{literal}'"))
        .execute(&pool)
        .await?;
    std::fs::copy(&temp, &path)?;
    let _ = std::fs::remove_file(&temp);
    Ok(path)
}

#[tauri::command]
pub async fn restore_database(state: State<'_, AppState>, path: String) -> AppResult<String> {
    let source = Path::new(&path);
    let bytes =
        std::fs::read(source).map_err(|_| validation("That backup file could not be read."))?;
    if !bytes.starts_with(b"SQLite format 3\0") {
        return Err(validation("That file is not a Mnemo database backup."));
    }
    if bytes.len() < 8192 {
        return Err(validation("The backup file looks incomplete."));
    }

    // Keep a copy of the current database before replacing it.
    let pool = state.db().await;
    crate::db::checkpoint(&pool).await?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let safety = state
        .db_path
        .with_file_name(format!("mnemo-before-restore-{stamp}.db"));
    let _ = std::fs::copy(&state.db_path, &safety);

    pool.close().await;
    for suffix in ["-wal", "-shm"] {
        let side = state.db_path.with_file_name(format!(
            "{}{suffix}",
            state
                .db_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("mnemo.db")
        ));
        let _ = std::fs::remove_file(side);
    }

    std::fs::copy(source, &state.db_path)?;
    let new_pool = crate::db::init(&state.db_path).await?;
    state.replace_pool(new_pool).await;

    Ok(safety.to_string_lossy().to_string())
}
