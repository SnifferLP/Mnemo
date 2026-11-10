use std::path::{Path, PathBuf};

use base64::prelude::{Engine as _, BASE64_STANDARD};
use sqlx::SqlitePool;

use crate::db::new_id;
use crate::error::{validation, AppResult};
use crate::models::Flashcard;
use crate::services::cards;

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const MAX_AUDIO_BYTES: usize = 40 * 1024 * 1024;

pub fn media_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("media")
}

fn allowed_extension(kind: &str, extension: &str) -> bool {
    let extension = extension.to_lowercase();
    match kind {
        "image" => matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "avif"
        ),
        "audio" => matches!(
            extension.as_str(),
            "webm" | "mp3" | "wav" | "m4a" | "ogg" | "oga" | "mp4"
        ),
        _ => false,
    }
}

fn max_bytes(kind: &str) -> usize {
    if kind == "audio" {
        MAX_AUDIO_BYTES
    } else {
        MAX_IMAGE_BYTES
    }
}

fn write_media(
    data_dir: &Path,
    card_id: &str,
    kind: &str,
    extension: &str,
    bytes: &[u8],
) -> AppResult<PathBuf> {
    if !allowed_extension(kind, extension) {
        return Err(validation(format!(
            "Unsupported {kind} format: {extension}"
        )));
    }
    if bytes.is_empty() {
        return Err(validation("The selected file is empty."));
    }
    if bytes.len() > max_bytes(kind) {
        return Err(validation("The file is too large."));
    }

    let dir = media_dir(data_dir);
    std::fs::create_dir_all(&dir)?;
    let file_name = format!("{card_id}-{}.{}", new_id(), extension.to_lowercase());
    let path = dir.join(file_name);
    std::fs::write(&path, bytes)?;
    Ok(path)
}

fn remove_file(path: Option<&str>) {
    if let Some(path) = path {
        let _ = std::fs::remove_file(path);
    }
}

pub async fn attach_from_path(
    pool: &SqlitePool,
    data_dir: &Path,
    card_id: &str,
    kind: &str,
    source: &Path,
) -> AppResult<Flashcard> {
    let card = cards::get(pool, card_id).await?;
    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();
    let bytes = std::fs::read(source).map_err(|_| validation("That file could not be read."))?;
    let path = write_media(data_dir, card_id, kind, &extension, &bytes)?;

    if kind == "image" {
        remove_file(card.image_path.as_deref());
    } else {
        remove_file(card.audio_path.as_deref());
    }
    cards::set_media_path(pool, card_id, kind, Some(&path.to_string_lossy())).await
}

pub async fn attach_bytes(
    pool: &SqlitePool,
    data_dir: &Path,
    card_id: &str,
    kind: &str,
    file_name: &str,
    encoded: &str,
) -> AppResult<Flashcard> {
    let card = cards::get(pool, card_id).await?;
    let payload = encoded
        .split_once("base64,")
        .map(|(_, rest)| rest)
        .unwrap_or(encoded);
    let bytes = BASE64_STANDARD.decode(payload.trim())?;
    let extension = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or(if kind == "audio" { "webm" } else { "png" })
        .to_string();

    let path = write_media(data_dir, card_id, kind, &extension, &bytes)?;
    if kind == "image" {
        remove_file(card.image_path.as_deref());
    } else {
        remove_file(card.audio_path.as_deref());
    }
    cards::set_media_path(pool, card_id, kind, Some(&path.to_string_lossy())).await
}

pub async fn clear(pool: &SqlitePool, card_id: &str, kind: &str) -> AppResult<Flashcard> {
    let card = cards::get(pool, card_id).await?;
    if kind == "image" {
        remove_file(card.image_path.as_deref());
    } else {
        remove_file(card.audio_path.as_deref());
    }
    cards::set_media_path(pool, card_id, kind, None).await
}
