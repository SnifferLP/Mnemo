pub mod ai;
pub mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod export;
pub mod import;
pub mod learning;
pub mod models;
pub mod services;
pub mod settings;
pub mod spaced_repetition;
pub mod statistics;

use std::path::PathBuf;

use sqlx::SqlitePool;
use tauri::Manager;
use tokio::sync::RwLock;

pub use error::{AppError, AppResult};

/// Shared application state. The pool lives behind a lock so a database restore
/// can swap it out without restarting the process.
pub struct AppState {
    pool: RwLock<SqlitePool>,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub vault: crypto::KeyVault,
    pub http: reqwest::Client,
}

impl AppState {
    pub async fn db(&self) -> SqlitePool {
        self.pool.read().await.clone()
    }

    pub async fn replace_pool(&self, pool: SqlitePool) {
        *self.pool.write().await = pool;
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let base_dir = handle.path().app_data_dir()?;
            // Development runs keep their own database so experiments and test
            // data can never leak into the installed application's library.
            #[cfg(debug_assertions)]
            let data_dir = base_dir.join("dev");
            #[cfg(not(debug_assertions))]
            let data_dir = base_dir;
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(data_dir.join("media"))?;

            let db_path = data_dir.join("mnemo.db");
            let pool = tauri::async_runtime::block_on(db::init(&db_path))?;
            let vault = crypto::KeyVault::load_or_create(&data_dir)?;

            app.manage(AppState {
                pool: RwLock::new(pool),
                data_dir,
                db_path,
                vault,
                http: ai::client::http_client(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // folders
            commands::library::list_folders,
            commands::library::create_folder,
            commands::library::update_folder,
            commands::library::move_folder,
            commands::library::delete_folder,
            // study sets
            commands::library::list_study_sets,
            commands::library::get_study_set,
            commands::library::create_study_set,
            commands::library::update_study_set,
            commands::library::delete_study_set,
            commands::library::set_study_set_archived,
            commands::library::duplicate_study_set,
            commands::library::set_study_set_favorite,
            commands::library::move_study_set,
            commands::library::set_study_set_tags,
            commands::library::list_tags,
            commands::library::delete_tag,
            // cards
            commands::library::create_card,
            commands::library::bulk_create_cards,
            commands::library::update_card,
            commands::library::delete_card,
            commands::library::duplicate_card,
            commands::library::reorder_cards,
            commands::library::attach_card_media,
            commands::library::attach_card_media_bytes,
            commands::library::remove_card_media,
            // documents
            commands::library::list_documents,
            commands::library::get_document,
            commands::library::import_document_file,
            commands::library::save_document_text,
            commands::library::delete_document,
            // learning
            commands::study::get_learning_queue,
            commands::study::start_study_session,
            commands::study::finish_study_session,
            commands::study::review_card,
            commands::study::generate_test,
            commands::study::submit_test,
            commands::study::record_matching_result,
            commands::study::check_card_answer,
            commands::study::reset_set_progress,
            // ai
            commands::ai_cmds::ai_provider_presets,
            commands::ai_cmds::list_ai_providers,
            commands::ai_cmds::save_ai_provider,
            commands::ai_cmds::delete_ai_provider,
            commands::ai_cmds::set_default_ai_provider,
            commands::ai_cmds::test_ai_provider,
            commands::ai_cmds::list_ai_models,
            commands::ai_cmds::ai_generate_flashcards,
            commands::ai_cmds::ai_magic_notes,
            commands::ai_cmds::ai_chat,
            commands::ai_cmds::list_conversations,
            commands::ai_cmds::get_conversation,
            commands::ai_cmds::delete_conversation,
            // transfer
            commands::transfer::import_study_set_file,
            commands::transfer::import_study_set_text,
            commands::transfer::export_study_set,
            commands::transfer::backup_database,
            commands::transfer::restore_database,
            // insights
            commands::insights::get_dashboard,
            commands::insights::get_statistics,
            commands::insights::get_activity_calendar,
            commands::insights::get_set_statistics,
            // preferences
            commands::prefs::get_settings,
            commands::prefs::save_settings,
            commands::prefs::app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mnemo");
}
