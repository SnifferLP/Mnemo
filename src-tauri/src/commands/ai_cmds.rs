use serde::Serialize;
use tauri::State;

use crate::ai::client::{self, ChatMessage as AiMessage};
use crate::ai::prompts;
use crate::db::{new_id, now_iso};
use crate::error::{validation, AppResult};
use crate::models::{
    AiProviderInfo, ChatMessage, ChatReply, ChatRequest, Conversation, GenerateCardsRequest,
    GeneratedCard, MagicNotesRequest, MagicNotesResult, SaveProviderInput,
};
use crate::services::{cards, documents, providers, sets};
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPreset {
    pub kind: String,
    pub label: String,
    pub base_url: String,
    pub model: String,
    pub needs_key: bool,
    pub note: String,
}

#[tauri::command]
pub async fn ai_provider_presets() -> AppResult<Vec<ProviderPreset>> {
    Ok(vec![
        ProviderPreset {
            kind: "openai".into(),
            label: "OpenAI".into(),
            base_url: "https://api.openai.com/v1".into(),
            model: "gpt-4o-mini".into(),
            needs_key: true,
            note: "Official OpenAI API".into(),
        },
        ProviderPreset {
            kind: "openrouter".into(),
            label: "OpenRouter".into(),
            base_url: "https://openrouter.ai/api/v1".into(),
            model: "openai/gpt-4o-mini".into(),
            needs_key: true,
            note: "Many models behind one key".into(),
        },
        ProviderPreset {
            kind: "mistral".into(),
            label: "Mistral".into(),
            base_url: "https://api.mistral.ai/v1".into(),
            model: "mistral-small-latest".into(),
            needs_key: true,
            note: "European provider".into(),
        },
        ProviderPreset {
            kind: "gemini".into(),
            label: "Google Gemini".into(),
            base_url: client::GEMINI_DEFAULT_BASE.into(),
            model: "gemini-3.8-flash".into(),
            needs_key: true,
            note: "Official Google AI Studio API".into(),
        },
        ProviderPreset {
            kind: "ollama".into(),
            label: "Ollama (local)".into(),
            base_url: "http://localhost:11434/v1".into(),
            model: "llama3.1".into(),
            needs_key: false,
            note: "Runs fully offline on your machine".into(),
        },
        ProviderPreset {
            kind: "custom".into(),
            label: "Custom endpoint".into(),
            base_url: "".into(),
            model: "".into(),
            needs_key: true,
            note: "Any OpenAI-compatible API".into(),
        },
    ])
}

#[tauri::command]
pub async fn list_ai_providers(state: State<'_, AppState>) -> AppResult<Vec<AiProviderInfo>> {
    let pool = state.db().await;
    providers::list(&pool).await
}

#[tauri::command]
pub async fn save_ai_provider(
    state: State<'_, AppState>,
    input: SaveProviderInput,
) -> AppResult<AiProviderInfo> {
    let pool = state.db().await;
    providers::save(&pool, &state.vault, input).await
}

#[tauri::command]
pub async fn delete_ai_provider(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    providers::delete(&pool, &id).await
}

#[tauri::command]
pub async fn set_default_ai_provider(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    providers::set_default(&pool, &id).await
}

#[tauri::command]
pub async fn test_ai_provider(state: State<'_, AppState>, id: String) -> AppResult<String> {
    let pool = state.db().await;
    let (_, config) = providers::resolve(&pool, &state.vault, Some(&id)).await?;
    let messages = vec![AiMessage {
        role: "user".into(),
        content: "Reply with exactly: Mnemo connection OK".into(),
    }];
    let reply = client::chat(&state.http, &config, &messages, Some(64), false).await?;
    Ok(reply.trim().to_string())
}

/// Lists models for a saved provider, or for the values currently typed into
/// the provider dialog before anything is saved.
#[tauri::command]
pub async fn list_ai_models(
    state: State<'_, AppState>,
    provider_id: Option<String>,
    kind: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
) -> AppResult<Vec<String>> {
    let pool = state.db().await;
    let (kind, base_url, api_key) = match provider_id.filter(|id| !id.trim().is_empty()) {
        Some(id) => {
            let (row, config) = providers::resolve(&pool, &state.vault, Some(&id)).await?;
            (row.kind, row.base_url, config.api_key)
        }
        None => {
            let kind = kind.unwrap_or_default();
            let base_url = base_url.unwrap_or_default();
            let provided = api_key
                .map(|key| key.trim().to_string())
                .filter(|key| !key.is_empty());
            if provided.is_none() && kind != "ollama" {
                return Err(validation("Enter the API key to load the model list."));
            }
            (kind, base_url, provided)
        }
    };

    client::list_models(&state.http, &kind, &base_url, api_key.as_deref()).await
}

fn compose_source(request_text: &str, documents_text: &str) -> String {
    let mut source = String::new();
    if !request_text.trim().is_empty() {
        source.push_str(request_text.trim());
    }
    if !documents_text.trim().is_empty() {
        source.push_str(documents_text);
    }
    let limit = 60_000;
    if source.chars().count() > limit {
        source.chars().take(limit).collect()
    } else {
        source
    }
}

#[tauri::command]
pub async fn ai_generate_flashcards(
    state: State<'_, AppState>,
    request: GenerateCardsRequest,
) -> AppResult<Vec<GeneratedCard>> {
    let pool = state.db().await;
    let settings = crate::settings::load(&pool).await?;
    let doc_text = documents::text_for_ids(&pool, &request.document_ids).await?;
    let source = compose_source(&request.source_text, &doc_text);
    if source.trim().chars().count() < 40 {
        return Err(validation(
            "Paste at least a few sentences, or choose an imported document.",
        ));
    }

    let mut system = prompts::flashcard_system(&request);
    if let Some(set_id) = &request.set_id {
        let existing = cards::list(&pool, set_id).await?;
        if !existing.is_empty() {
            let titles = existing
                .iter()
                .take(40)
                .map(|c| c.card.front.clone())
                .collect::<Vec<_>>()
                .join("; ");
            system.push_str(&format!(
                "\nAvoid duplicating these existing cards: {}",
                prompts::truncate(&titles, 2000)
            ));
        }
    }

    let messages = vec![
        AiMessage {
            role: "system".into(),
            content: system,
        },
        AiMessage {
            role: "user".into(),
            content: format!("Source material:\n\n{source}"),
        },
    ];

    let provider_id = request
        .provider_id
        .clone()
        .or(settings.default_provider_id.clone());
    let (_, config) = providers::resolve(&pool, &state.vault, provider_id.as_deref()).await?;
    let json_mode = matches!(config.kind.as_str(), "openai" | "mistral" | "gemini");
    let raw = client::chat(&state.http, &config, &messages, Some(4096), json_mode).await?;
    let value = client::extract_json(&raw)?;

    let list = value
        .get("cards")
        .and_then(|v| v.as_array())
        .or_else(|| value.as_array())
        .ok_or_else(|| validation("The model returned no cards."))?;

    let mut generated = Vec::new();
    for item in list {
        let front = item
            .get("front")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let back = item
            .get("back")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if front.is_empty() || back.is_empty() {
            continue;
        }
        generated.push(GeneratedCard {
            front: front.to_string(),
            back: back.to_string(),
            explanation: item
                .get("explanation")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            hint: item
                .get("hint")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        });
    }

    if generated.is_empty() {
        return Err(validation(
            "The model did not return usable cards. Try again.",
        ));
    }
    Ok(generated)
}

#[tauri::command]
pub async fn ai_magic_notes(
    state: State<'_, AppState>,
    request: MagicNotesRequest,
) -> AppResult<MagicNotesResult> {
    let pool = state.db().await;
    let settings = crate::settings::load(&pool).await?;
    let doc_text = documents::text_for_ids(&pool, &request.document_ids).await?;
    let source = compose_source(&request.source_text, &doc_text);
    if source.trim().chars().count() < 80 {
        return Err(validation(
            "Add more notes to work with — at least a paragraph.",
        ));
    }

    let messages = vec![
        AiMessage {
            role: "system".into(),
            content: prompts::magic_notes_system(&request),
        },
        AiMessage {
            role: "user".into(),
            content: format!("Notes:\n\n{source}"),
        },
    ];

    let provider_id = request
        .provider_id
        .clone()
        .or(settings.default_provider_id.clone());
    let (_, config) = providers::resolve(&pool, &state.vault, provider_id.as_deref()).await?;
    let json_mode = matches!(config.kind.as_str(), "openai" | "mistral" | "gemini");
    let raw = client::chat(&state.http, &config, &messages, Some(4096), json_mode).await?;
    let value = client::extract_json(&raw)?;

    let result: MagicNotesResult = serde_json::from_value(value)
        .map_err(|_| validation("The model returned an unexpected notes structure. Try again."))?;
    Ok(result)
}

async fn gaps_for_set(pool: &sqlx::SqlitePool, set_id: &str, limit: usize) -> AppResult<String> {
    let all = cards::list(pool, set_id).await?;
    let weak: Vec<_> = all
        .iter()
        .filter(|c| c.progress.wrong_count > 0)
        .map(|c| (c.card.clone(), c.progress.clone()))
        .take(limit)
        .collect();
    Ok(prompts::gaps_context(&weak, limit))
}

#[tauri::command]
pub async fn ai_chat(state: State<'_, AppState>, request: ChatRequest) -> AppResult<ChatReply> {
    if request.message.trim().is_empty() {
        return Err(validation("Write a message first."));
    }
    let pool = state.db().await;
    let settings = crate::settings::load(&pool).await?;

    let provider_id = request
        .provider_id
        .clone()
        .or(settings.default_provider_id.clone());
    let (provider_row, config) =
        providers::resolve(&pool, &state.vault, provider_id.as_deref()).await?;

    let conversation_id = match request.conversation_id.clone() {
        Some(id) => {
            let exists: Option<(String,)> =
                sqlx::query_as("SELECT id FROM ai_conversations WHERE id = ?")
                    .bind(&id)
                    .fetch_optional(&pool)
                    .await?;
            if exists.is_none() {
                return Err(crate::error::not_found("conversation"));
            }
            id
        }
        None => {
            let id = new_id();
            let title: String = request.message.trim().chars().take(60).collect();
            let now = now_iso();
            sqlx::query(
                "INSERT INTO ai_conversations (id, title, provider_id, set_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(&title)
            .bind(&provider_row.id)
            .bind(&request.set_id)
            .bind(&now)
            .bind(&now)
            .execute(&pool)
            .await?;
            id
        }
    };

    let set_title = match &request.set_id {
        Some(set_id) => sets::get(&pool, set_id).await.ok().map(|s| s.title),
        None => None,
    };

    let mut system = prompts::tutor_system(&request.mode, set_title.as_deref());
    if let Some(set_id) = &request.set_id {
        if request.share_set {
            let all = cards::list(&pool, set_id).await?;
            let plain: Vec<_> = all.iter().map(|c| c.card.clone()).collect();
            system.push_str("\n\n");
            system.push_str(&prompts::set_context(&plain, 40));
        }
        if request.share_gaps {
            let gaps = gaps_for_set(&pool, set_id, 8).await?;
            if !gaps.is_empty() {
                system.push_str("\n\n");
                system.push_str(&gaps);
            }
        }
    }

    let mut messages = vec![AiMessage {
        role: "system".into(),
        content: system,
    }];

    if request.share_history {
        let history: Vec<(String, String)> = sqlx::query_as(
            "SELECT role, content FROM ai_messages WHERE conversation_id = ?
             ORDER BY created_at DESC LIMIT 18",
        )
        .bind(&conversation_id)
        .fetch_all(&pool)
        .await?;
        for (role, content) in history.into_iter().rev() {
            messages.push(AiMessage { role, content });
        }
    }

    messages.push(AiMessage {
        role: "user".into(),
        content: request.message.trim().to_string(),
    });

    let user_id = new_id();
    sqlx::query(
        "INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, 'user', ?, ?)",
    )
    .bind(&user_id)
    .bind(&conversation_id)
    .bind(request.message.trim())
    .bind(now_iso())
    .execute(&pool)
    .await?;

    let reply = client::chat(&state.http, &config, &messages, Some(1200), false).await?;

    let assistant_id = new_id();
    let created_at = now_iso();
    sqlx::query(
        "INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, 'assistant', ?, ?)",
    )
    .bind(&assistant_id)
    .bind(&conversation_id)
    .bind(&reply)
    .bind(&created_at)
    .execute(&pool)
    .await?;

    sqlx::query("UPDATE ai_conversations SET updated_at = ? WHERE id = ?")
        .bind(&created_at)
        .bind(&conversation_id)
        .execute(&pool)
        .await?;

    let title: String = sqlx::query_scalar("SELECT title FROM ai_conversations WHERE id = ?")
        .bind(&conversation_id)
        .fetch_one(&pool)
        .await?;

    Ok(ChatReply {
        conversation_id: conversation_id.clone(),
        message: ChatMessage {
            id: assistant_id,
            conversation_id,
            role: "assistant".into(),
            content: reply,
            created_at,
        },
        title,
    })
}

#[tauri::command]
pub async fn list_conversations(state: State<'_, AppState>) -> AppResult<Vec<Conversation>> {
    let pool = state.db().await;
    let rows = sqlx::query_as::<_, Conversation>(
        "SELECT * FROM ai_conversations ORDER BY updated_at DESC",
    )
    .fetch_all(&pool)
    .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn get_conversation(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<ChatMessage>> {
    let pool = state.db().await;
    let rows = sqlx::query_as::<_, ChatMessage>(
        "SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn delete_conversation(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.db().await;
    sqlx::query("DELETE FROM ai_conversations WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?;
    Ok(())
}
