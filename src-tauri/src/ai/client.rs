//! Chat client for OpenAI-compatible providers and Google Gemini.
//!
//! OpenAI, OpenRouter, Mistral, Ollama and custom endpoints speak the
//! `/chat/completions` protocol. Gemini uses its own REST shape
//! (`models/{model}:generateContent` with `contents`/`parts`), so it has a
//! dedicated code path instead of being forced through the OpenAI envelope.
//! API keys are only ever read on the Rust side and never included in errors.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

/// Google AI Studio's REST version. Models are addressed below this path.
pub const GEMINI_DEFAULT_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub temperature: f64,
}

pub fn normalise_base_url(base_url: &str, kind: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return match kind {
            "openai" => "https://api.openai.com/v1".into(),
            "openrouter" => "https://openrouter.ai/api/v1".into(),
            "mistral" => "https://api.mistral.ai/v1".into(),
            "ollama" => "http://localhost:11434/v1".into(),
            "gemini" => GEMINI_DEFAULT_BASE.into(),
            _ => String::new(),
        };
    }
    trimmed.to_string()
}

fn openai_endpoint(base_url: &str, kind: &str) -> String {
    let base = normalise_base_url(base_url, kind);
    if base.ends_with("/chat/completions") {
        base
    } else {
        format!("{base}/chat/completions")
    }
}

#[derive(Debug, Deserialize)]
struct CompletionResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    #[serde(default)]
    content: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ErrorEnvelope {
    error: Option<ErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    message: Option<String>,
    #[serde(default)]
    status: Option<String>,
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .connect_timeout(Duration::from_secs(15))
        .user_agent("Mnemo/1.0 (local study app)")
        .build()
        .unwrap_or_default()
}

/// Sends a chat request and returns the assistant message text.
pub async fn chat(
    http: &reqwest::Client,
    config: &ProviderConfig,
    messages: &[ChatMessage],
    max_tokens: Option<i64>,
    json_mode: bool,
) -> AppResult<String> {
    if config.model.trim().is_empty() {
        return Err(AppError::Validation(
            "Choose a model for the AI provider in Settings.".into(),
        ));
    }
    if config.kind == "gemini" {
        return gemini_chat(http, config, messages, max_tokens, json_mode).await;
    }
    openai_chat(http, config, messages, max_tokens, json_mode).await
}

async fn openai_chat(
    http: &reqwest::Client,
    config: &ProviderConfig,
    messages: &[ChatMessage],
    max_tokens: Option<i64>,
    json_mode: bool,
) -> AppResult<String> {
    let url = openai_endpoint(&config.base_url, &config.kind);

    let mut body = json!({
        "model": config.model,
        "messages": messages,
        "temperature": config.temperature.clamp(0.0, 2.0),
        "stream": false,
    });
    if let Some(tokens) = max_tokens {
        body["max_tokens"] = json!(tokens.clamp(64, 8192));
    }
    if json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }

    let mut request = http.post(&url).json(&body);
    if let Some(key) = config.api_key.as_deref() {
        if !key.trim().is_empty() {
            request = request.bearer_auth(key.trim());
        }
    }
    if config.kind == "openrouter" {
        request = request
            .header("HTTP-Referer", "https://mnemo.local")
            .header("X-Title", "Mnemo");
    }

    let response = request.send().await.map_err(|e| {
        AppError::Ai(if e.is_timeout() {
            "The provider did not answer in time.".into()
        } else if e.is_connect() {
            format!("Could not reach {url}. Check the base URL and your connection.")
        } else {
            format!("Request failed: {e}")
        })
    })?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(api_error(status.as_u16(), &text));
    }

    let parsed: CompletionResponse = serde_json::from_str(&text)
        .map_err(|_| AppError::Ai("The provider returned an unexpected response.".into()))?;

    let content = parsed
        .choices
        .into_iter()
        .next()
        .and_then(|c| match c.message.content {
            Some(Value::String(s)) => Some(s),
            Some(Value::Array(parts)) => {
                let joined = parts
                    .iter()
                    .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("");
                if joined.is_empty() {
                    None
                } else {
                    Some(joined)
                }
            }
            _ => None,
        })
        .filter(|s| !s.trim().is_empty());

    content.ok_or_else(|| AppError::Ai("The model returned an empty answer.".into()))
}

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
    prompt_feedback: Option<GeminiPromptFeedback>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCandidate {
    content: Option<GeminiContent>,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiContent {
    #[serde(default)]
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiPromptFeedback {
    block_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiModelsResponse {
    #[serde(default)]
    models: Vec<GeminiModel>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModel {
    name: String,
    #[serde(default)]
    supported_generation_methods: Vec<String>,
    #[serde(default)]
    supported_actions: Vec<String>,
}

/// Builds a Gemini `generateContent` body.
///
/// System messages become `systemInstruction`, assistant turns become the
/// `model` role, and consecutive turns with the same role are merged because
/// Gemini expects alternating authors in most cases.
pub fn build_gemini_body(
    messages: &[ChatMessage],
    temperature: f64,
    max_tokens: Option<i64>,
    json_mode: bool,
) -> Value {
    let mut system: Vec<&str> = Vec::new();
    let mut turns: Vec<(&str, Vec<&str>)> = Vec::new();

    for message in messages {
        if message.content.trim().is_empty() {
            continue;
        }
        match message.role.as_str() {
            "system" => system.push(message.content.trim()),
            role => {
                let role = if role == "assistant" { "model" } else { "user" };
                match turns.last_mut() {
                    Some((last_role, parts)) if *last_role == role => {
                        parts.push(message.content.trim())
                    }
                    _ => turns.push((role, vec![message.content.trim()])),
                }
            }
        }
    }

    let contents: Vec<Value> = turns
        .into_iter()
        .map(|(role, parts)| {
            json!({
                "role": role,
                "parts": parts.into_iter().map(|text| json!({ "text": text })).collect::<Vec<_>>(),
            })
        })
        .collect();

    let mut generation = json!({ "temperature": temperature.clamp(0.0, 2.0) });
    if let Some(tokens) = max_tokens {
        generation["maxOutputTokens"] = json!(tokens.clamp(64, 8192));
    }
    if json_mode {
        generation["responseMimeType"] = json!("application/json");
    }

    let mut body = json!({
        "contents": contents,
        "generationConfig": generation,
    });
    if !system.is_empty() {
        body["systemInstruction"] = json!({
            "parts": [ { "text": system.join("\n\n") } ],
        });
    }
    body
}

fn gemini_block_message(reason: &str) -> String {
    match reason {
        "SAFETY" => {
            "Gemini blocked this request for safety reasons. Rephrase it and try again.".into()
        }
        "RECITATION" => "Gemini stopped because the answer would reproduce protected text.".into(),
        "MAX_TOKENS" => {
            "Gemini ran out of output tokens before finishing. Try a shorter request.".into()
        }
        other => format!("Gemini did not return an answer ({other})."),
    }
}

async fn gemini_chat(
    http: &reqwest::Client,
    config: &ProviderConfig,
    messages: &[ChatMessage],
    max_tokens: Option<i64>,
    json_mode: bool,
) -> AppResult<String> {
    let key = config
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .ok_or_else(|| {
            AppError::Validation(
                "Add your Google AI Studio API key for Gemini in Settings → AI.".into(),
            )
        })?;

    let base = normalise_base_url(&config.base_url, "gemini");
    let model = config.model.trim().trim_start_matches("models/");
    let url = format!("{base}/models/{model}:generateContent");
    let body = build_gemini_body(messages, config.temperature, max_tokens, json_mode);

    let response = http
        .post(&url)
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            AppError::Ai(if e.is_timeout() {
                "Gemini did not answer in time.".into()
            } else if e.is_connect() {
                "Could not reach Gemini. Check your connection and the base URL.".into()
            } else {
                format!("Request failed: {e}")
            })
        })?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(api_error(status.as_u16(), &text));
    }

    let parsed: GeminiResponse = serde_json::from_str(&text)
        .map_err(|_| AppError::Ai("Gemini returned an unexpected response.".into()))?;

    if let Some(reason) = parsed
        .prompt_feedback
        .as_ref()
        .and_then(|feedback| feedback.block_reason.as_deref())
    {
        return Err(AppError::Ai(gemini_block_message(reason)));
    }

    let candidate = parsed
        .candidates
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Ai("Gemini returned no answer.".into()))?;

    let joined = candidate
        .content
        .map(|content| {
            content
                .parts
                .into_iter()
                .filter_map(|part| part.text)
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    if joined.trim().is_empty() {
        return Err(AppError::Ai(match candidate.finish_reason.as_deref() {
            Some("MAX_TOKENS") => gemini_block_message("MAX_TOKENS"),
            Some(reason) if !reason.eq_ignore_ascii_case("STOP") => gemini_block_message(reason),
            _ => "Gemini returned an empty answer.".into(),
        }));
    }

    Ok(joined)
}

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    #[serde(default)]
    data: Vec<OpenAiModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModel {
    id: String,
}

async fn openai_models(
    http: &reqwest::Client,
    kind: &str,
    base_url: &str,
    api_key: Option<&str>,
) -> AppResult<Vec<String>> {
    let base = normalise_base_url(base_url, kind);
    if base.is_empty() {
        return Err(AppError::Validation(
            "Enter the API base URL before loading models.".into(),
        ));
    }
    let url = format!("{base}/models");
    let mut request = http.get(&url);
    if let Some(key) = api_key.map(str::trim).filter(|k| !k.is_empty()) {
        request = request.bearer_auth(key);
    }
    if kind == "openrouter" {
        request = request
            .header("HTTP-Referer", "https://mnemo.local")
            .header("X-Title", "Mnemo");
    }

    let response = request.send().await.map_err(|e| {
        AppError::Ai(if e.is_timeout() {
            "The provider did not answer in time.".into()
        } else if e.is_connect() {
            format!("Could not reach {url}. Check the base URL and your connection.")
        } else {
            format!("Request failed: {e}")
        })
    })?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(api_error(status.as_u16(), &text));
    }

    let parsed: OpenAiModelsResponse = serde_json::from_str(&text)
        .map_err(|_| AppError::Ai("The provider returned an unexpected model list.".into()))?;
    let mut models: Vec<String> = parsed
        .data
        .into_iter()
        .map(|m| m.id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();
    models.sort_by_key(|id| id.to_lowercase());
    models.dedup();
    Ok(models)
}

async fn gemini_models(
    http: &reqwest::Client,
    base_url: &str,
    api_key: Option<&str>,
) -> AppResult<Vec<String>> {
    let key = api_key
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .ok_or_else(|| {
            AppError::Validation("Enter the Gemini API key to load the model list.".into())
        })?;
    let base = normalise_base_url(base_url, "gemini");

    let mut models: Vec<String> = Vec::new();
    let mut page_token: Option<String> = None;
    for _ in 0..5 {
        let mut url = format!("{base}/models?pageSize=1000");
        if let Some(token) = page_token.as_deref() {
            url.push_str(&format!("&pageToken={token}"));
        }

        let response = http
            .get(&url)
            .header("x-goog-api-key", key)
            .send()
            .await
            .map_err(|e| {
                AppError::Ai(if e.is_timeout() {
                    "Gemini did not answer in time.".into()
                } else if e.is_connect() {
                    "Could not reach Gemini. Check your connection and the base URL.".into()
                } else {
                    format!("Request failed: {e}")
                })
            })?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(api_error(status.as_u16(), &text));
        }

        let parsed: GeminiModelsResponse = serde_json::from_str(&text)
            .map_err(|_| AppError::Ai("Gemini returned an unexpected model list.".into()))?;

        for model in parsed.models {
            let methods_empty =
                model.supported_generation_methods.is_empty() && model.supported_actions.is_empty();
            let can_generate = methods_empty
                || model
                    .supported_generation_methods
                    .iter()
                    .any(|method| method == "generateContent")
                || model
                    .supported_actions
                    .iter()
                    .any(|action| action == "generateContent");
            let name = model.name.trim().trim_start_matches("models/").to_string();
            if can_generate && !name.is_empty() {
                models.push(name);
            }
        }

        page_token = parsed.next_page_token.filter(|t| !t.is_empty());
        if page_token.is_none() {
            break;
        }
    }

    models.sort_by_key(|id| id.to_lowercase());
    models.dedup();
    Ok(models)
}

/// Lists chat-capable models for a provider.
pub async fn list_models(
    http: &reqwest::Client,
    kind: &str,
    base_url: &str,
    api_key: Option<&str>,
) -> AppResult<Vec<String>> {
    if kind == "gemini" {
        gemini_models(http, base_url, api_key).await
    } else {
        openai_models(http, kind, base_url, api_key).await
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

fn error_detail(text: &str) -> Option<String> {
    let parsed = serde_json::from_str::<ErrorEnvelope>(text).ok()?;
    let body = parsed.error?;
    body.message
        .map(|message| message.trim().to_string())
        .filter(|message| !message.is_empty())
        .or(body.status)
}

/// Turns a provider error response into a user-facing message.
///
/// Only the provider's own message and the HTTP status are surfaced; request
/// headers (which carry the API key) are never included.
fn api_error(status: u16, text: &str) -> AppError {
    let detail = error_detail(text).unwrap_or_else(|| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            "No details were returned".to_string()
        } else if trimmed.chars().count() > 400 {
            format!("{}…", trimmed.chars().take(400).collect::<String>())
        } else {
            trimmed.to_string()
        }
    });

    let hint = match status {
        400 => " Check the model and request.",
        401 | 403 => " The API key was rejected — check it in Settings → AI.",
        404 => " The model or endpoint was not found.",
        429 => " Rate limit or quota exceeded — wait a moment and try again.",
        500..=599 => " The provider had a server error — try again shortly.",
        _ => "",
    };

    AppError::Ai(format!("{detail} ({status}).{hint}"))
}

/// Extracts a JSON value from a model answer that may contain prose or fences.
pub fn extract_json(raw: &str) -> AppResult<serde_json::Value> {
    let cleaned = raw.trim();
    let candidates = [
        cleaned,
        cleaned
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim(),
    ];

    for candidate in candidates {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(candidate) {
            return Ok(value);
        }
        if let (Some(start), Some(end)) = (candidate.find(['{', '[']), candidate.rfind(['}', ']']))
        {
            if end > start {
                if let Ok(value) =
                    serde_json::from_str::<serde_json::Value>(&candidate[start..=end])
                {
                    return Ok(value);
                }
            }
        }
    }

    Err(AppError::Ai(
        "The model did not return valid JSON. Try again, or pick a stronger model.".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
        }
    }

    #[test]
    fn gemini_uses_its_own_default_base() {
        assert_eq!(normalise_base_url("", "gemini"), GEMINI_DEFAULT_BASE);
        assert_eq!(
            normalise_base_url("  https://example.test/v1beta/  ", "gemini"),
            "https://example.test/v1beta"
        );
    }

    #[test]
    fn gemini_body_moves_system_prompt_and_maps_roles() {
        let body = build_gemini_body(
            &[
                message("system", "You are a tutor."),
                message("user", "Question"),
                message("assistant", "Answer"),
                message("user", "Follow-up"),
            ],
            0.4,
            Some(1200),
            true,
        );

        assert_eq!(
            body["systemInstruction"]["parts"][0]["text"],
            "You are a tutor."
        );
        assert_eq!(body["contents"][0]["role"], "user");
        assert_eq!(body["contents"][1]["role"], "model");
        assert_eq!(body["contents"][1]["parts"][0]["text"], "Answer");
        assert_eq!(body["contents"][2]["role"], "user");
        assert_eq!(body["generationConfig"]["maxOutputTokens"], 1200);
        assert_eq!(
            body["generationConfig"]["responseMimeType"],
            "application/json"
        );
        assert_eq!(body["generationConfig"]["temperature"], 0.4);
    }

    #[test]
    fn gemini_body_merges_consecutive_turns() {
        let body = build_gemini_body(
            &[
                message("user", "One"),
                message("user", "Two"),
                message("assistant", "Three"),
            ],
            0.7,
            None,
            false,
        );
        assert_eq!(body["contents"].as_array().unwrap().len(), 2);
        assert_eq!(body["contents"][0]["parts"].as_array().unwrap().len(), 2);
        assert!(body["systemInstruction"].is_null());
        assert!(body["generationConfig"]["maxOutputTokens"].is_null());
        assert!(body["generationConfig"]["responseMimeType"].is_null());
    }

    #[tokio::test]
    async fn gemini_requires_a_key_before_sending_anything() {
        let http = http_client();
        let config = ProviderConfig {
            kind: "gemini".into(),
            base_url: String::new(),
            model: "gemini-3.8-flash".into(),
            api_key: None,
            temperature: 0.7,
        };
        let error = chat(&http, &config, &[message("user", "hi")], None, false)
            .await
            .unwrap_err();
        assert!(format!("{error:?}").contains("API key"));

        let error = list_models(&http, "gemini", "", None).await.unwrap_err();
        assert!(format!("{error:?}").contains("API key"));
    }

    #[test]
    fn error_messages_are_actionable_and_never_contain_keys() {
        let key = "AIza-secret-key-value";
        let body = r#"{"error":{"code":429,"message":"Quota exceeded for quota metric","status":"RESOURCE_EXHAUSTED"}}"#;
        let error = api_error(429, body);
        let text = format!("{error:?}");
        assert!(text.contains("Rate limit"), "{text}");
        assert!(!text.contains(key));

        let rejected = api_error(
            401,
            r#"{"error":{"message":"API key not valid. Please pass a valid API key."}}"#,
        );
        let text = format!("{rejected:?}");
        assert!(text.contains("rejected"), "{text}");
        assert!(!text.contains(key));

        let missing_model = api_error(404, "not found");
        let text = format!("{missing_model:?}");
        assert!(text.contains("was not found"), "{text}");
    }
}
