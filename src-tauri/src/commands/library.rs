use std::path::Path;

use tauri::State;

use crate::models::{
    CardInput, CreateSetInput, DocumentSummary, Flashcard, Folder, FolderNode, ImportedDocument,
    StudySetDetail, StudySetSummary, Tag, UpdateSetInput,
};
use crate::services::{cards, documents, folders, media, sets};
use crate::{AppResult, AppState};

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_folders(state: State<'_, AppState>) -> AppResult<Vec<FolderNode>> {
    let pool = state.db().await;
    folders::list(&pool).await
}

#[tauri::command]
pub async fn create_folder(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
    color: Option<String>,
) -> AppResult<Folder> {
    let pool = state.db().await;
    folders::create(&pool, &name, parent_id, color).await
}

#[tauri::command]
pub async fn update_folder(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> AppResult<Folder> {
    let pool = state.db().await;
    folders::update(&pool, &id, name, color).await
}

#[tauri::command]
pub async fn move_folder(
    state: State<'_, AppState>,
    id: String,
    parent_id: Option<String>,
) -> AppResult<Folder> {
    let pool = state.db().await;
    folders::move_folder(&pool, &id, parent_id).await
}

#[tauri::command]
pub async fn delete_folder(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    folders::delete(&pool, &id).await
}

// ---------------------------------------------------------------------------
// Study sets
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_study_sets(
    state: State<'_, AppState>,
    query: Option<String>,
    folder_id: Option<String>,
    tag_id: Option<String>,
    favorites_only: Option<bool>,
    archived_only: Option<bool>,
    sort: Option<String>,
) -> AppResult<Vec<StudySetSummary>> {
    let pool = state.db().await;
    sets::list_summaries(
        &pool,
        query,
        folder_id,
        tag_id,
        favorites_only.unwrap_or(false),
        archived_only.unwrap_or(false),
        sort.as_deref().unwrap_or("recent"),
    )
    .await
}

#[tauri::command]
pub async fn get_study_set(state: State<'_, AppState>, id: String) -> AppResult<StudySetDetail> {
    let pool = state.db().await;
    sets::detail(&pool, &id).await
}

#[tauri::command]
pub async fn create_study_set(
    state: State<'_, AppState>,
    input: CreateSetInput,
) -> AppResult<StudySetDetail> {
    let pool = state.db().await;
    sets::create(&pool, input).await
}

#[tauri::command]
pub async fn update_study_set(
    state: State<'_, AppState>,
    id: String,
    input: UpdateSetInput,
) -> AppResult<StudySetDetail> {
    let pool = state.db().await;
    sets::update(&pool, &id, input).await
}

#[tauri::command]
pub async fn delete_study_set(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    sets::delete(&pool, &id).await
}

#[tauri::command]
pub async fn set_study_set_archived(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<()> {
    let pool = state.db().await;
    sets::set_archived(&pool, &id, archived).await
}

#[tauri::command]
pub async fn duplicate_study_set(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<StudySetDetail> {
    let pool = state.db().await;
    sets::duplicate(&pool, &id).await
}

#[tauri::command]
pub async fn set_study_set_favorite(
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
) -> AppResult<()> {
    let pool = state.db().await;
    sqlx::query("UPDATE study_sets SET is_favorite = ?, updated_at = ? WHERE id = ?")
        .bind(favorite)
        .bind(crate::db::now_iso())
        .bind(&id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn move_study_set(
    state: State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
) -> AppResult<()> {
    let pool = state.db().await;
    if let Some(folder) = &folder_id {
        let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM folders WHERE id = ?")
            .bind(folder)
            .fetch_optional(&pool)
            .await?;
        if exists.is_none() {
            return Err(crate::error::not_found("folder"));
        }
    }
    sqlx::query("UPDATE study_sets SET folder_id = ?, updated_at = ? WHERE id = ?")
        .bind(folder_id)
        .bind(crate::db::now_iso())
        .bind(&id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn set_study_set_tags(
    state: State<'_, AppState>,
    id: String,
    tags: Vec<String>,
) -> AppResult<Vec<String>> {
    let pool = state.db().await;
    sets::set_tags(&pool, &id, &tags).await
}

#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<Tag>> {
    let pool = state.db().await;
    sets::list_tags(&pool).await
}

#[tauri::command]
pub async fn delete_tag(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    sets::delete_tag(&pool, &id).await
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_card(
    state: State<'_, AppState>,
    set_id: String,
    input: CardInput,
) -> AppResult<Flashcard> {
    let pool = state.db().await;
    cards::create(&pool, &set_id, &input).await
}

#[tauri::command]
pub async fn bulk_create_cards(
    state: State<'_, AppState>,
    set_id: String,
    inputs: Vec<CardInput>,
) -> AppResult<Vec<Flashcard>> {
    let pool = state.db().await;
    cards::bulk_create(&pool, &set_id, &inputs).await
}

#[tauri::command]
pub async fn update_card(
    state: State<'_, AppState>,
    id: String,
    input: CardInput,
) -> AppResult<Flashcard> {
    let pool = state.db().await;
    cards::update(&pool, &id, &input).await
}

#[tauri::command]
pub async fn delete_card(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    let card = cards::delete(&pool, &id).await?;
    for path in [card.image_path, card.audio_path].into_iter().flatten() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
pub async fn duplicate_card(state: State<'_, AppState>, id: String) -> AppResult<Flashcard> {
    let pool = state.db().await;
    cards::duplicate(&pool, &id).await
}

#[tauri::command]
pub async fn reorder_cards(
    state: State<'_, AppState>,
    set_id: String,
    card_ids: Vec<String>,
) -> AppResult<()> {
    let pool = state.db().await;
    cards::reorder(&pool, &set_id, &card_ids).await
}

#[tauri::command]
pub async fn attach_card_media(
    state: State<'_, AppState>,
    card_id: String,
    kind: String,
    path: String,
) -> AppResult<Flashcard> {
    let pool = state.db().await;
    media::attach_from_path(&pool, &state.data_dir, &card_id, &kind, Path::new(&path)).await
}

#[tauri::command]
pub async fn attach_card_media_bytes(
    state: State<'_, AppState>,
    card_id: String,
    kind: String,
    file_name: String,
    data: String,
) -> AppResult<Flashcard> {
    let pool = state.db().await;
    media::attach_bytes(&pool, &state.data_dir, &card_id, &kind, &file_name, &data).await
}

#[tauri::command]
pub async fn remove_card_media(
    state: State<'_, AppState>,
    card_id: String,
    kind: String,
) -> AppResult<Flashcard> {
    let pool = state.db().await;
    media::clear(&pool, &card_id, &kind).await
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_documents(
    state: State<'_, AppState>,
    kind: Option<String>,
) -> AppResult<Vec<DocumentSummary>> {
    let pool = state.db().await;
    documents::list(&pool, kind).await
}

#[tauri::command]
pub async fn get_document(state: State<'_, AppState>, id: String) -> AppResult<ImportedDocument> {
    let pool = state.db().await;
    documents::get(&pool, &id).await
}

#[tauri::command]
pub async fn import_document_file(
    state: State<'_, AppState>,
    path: String,
    kind: Option<String>,
) -> AppResult<ImportedDocument> {
    let extracted = crate::import::extract_document(Path::new(&path))?;
    let pool = state.db().await;
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_string());
    documents::insert(
        &pool,
        &extracted,
        kind.as_deref().unwrap_or("material"),
        name,
    )
    .await
}

#[tauri::command]
pub async fn save_document_text(
    state: State<'_, AppState>,
    title: String,
    content: String,
    kind: Option<String>,
) -> AppResult<ImportedDocument> {
    let pool = state.db().await;
    let title = if title.trim().is_empty() {
        let preview: String = content.trim().chars().take(48).collect();
        preview
    } else {
        title
    };
    documents::insert_text(
        &pool,
        &title,
        &content,
        kind.as_deref().unwrap_or("material"),
    )
    .await
}

#[tauri::command]
pub async fn delete_document(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    documents::delete(&pool, &id).await
}
