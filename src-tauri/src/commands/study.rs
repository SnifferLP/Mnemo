use serde::Serialize;
use tauri::State;

use crate::ai::{client, prompts};
use crate::db::{new_id, now_iso};
use crate::error::{validation, AppResult};
use crate::learning::{self, TestAnswer, TestConfig, TestOutcome, TestQuestion};
use crate::models::{CardProgress, StudyCard, StudySession};
use crate::services::{cards, providers, sessions, sets};
use crate::spaced_repetition::Outcome;
use crate::AppState;

#[tauri::command]
pub async fn get_learning_queue(
    state: State<'_, AppState>,
    set_id: String,
    mode: Option<String>,
    limit: Option<usize>,
) -> AppResult<Vec<StudyCard>> {
    let pool = state.db().await;
    let all = cards::list(&pool, &set_id).await?;
    let mode = mode.unwrap_or_else(|| "flashcards".into());
    Ok(learning::select_queue(all, &mode, limit.unwrap_or(0)))
}

#[tauri::command]
pub async fn start_study_session(
    state: State<'_, AppState>,
    set_id: Option<String>,
    mode: String,
) -> AppResult<String> {
    let pool = state.db().await;
    sessions::start(&pool, set_id, &mode).await
}

#[tauri::command]
pub async fn finish_study_session(
    state: State<'_, AppState>,
    session_id: String,
    cards_studied: i64,
    correct: i64,
    incorrect: i64,
    duration_seconds: i64,
) -> AppResult<StudySession> {
    let pool = state.db().await;
    sessions::finish(
        &pool,
        &session_id,
        cards_studied,
        correct,
        incorrect,
        duration_seconds,
    )
    .await
}

#[tauri::command]
pub async fn review_card(
    state: State<'_, AppState>,
    card_id: String,
    outcome: String,
    mode: Option<String>,
    duration_ms: Option<i64>,
) -> AppResult<CardProgress> {
    let pool = state.db().await;
    sessions::record_review(
        &pool,
        &card_id,
        Outcome::parse(&outcome),
        mode.as_deref().unwrap_or("flashcards"),
        duration_ms.unwrap_or(0),
    )
    .await
}

#[tauri::command]
pub async fn generate_test(
    state: State<'_, AppState>,
    set_id: String,
    config: TestConfig,
) -> AppResult<Vec<TestQuestion>> {
    let pool = state.db().await;
    let all = cards::list(&pool, &set_id).await?;
    learning::generate_test(&all, &config)
}

#[tauri::command]
pub async fn submit_test(
    state: State<'_, AppState>,
    set_id: String,
    questions: Vec<TestQuestion>,
    answers: Vec<TestAnswer>,
    duration_seconds: i64,
) -> AppResult<TestOutcome> {
    let pool = state.db().await;
    sets::get(&pool, &set_id).await?;
    let settings = crate::settings::load(&pool).await?;

    let graded = learning::grade_test(
        &questions,
        &answers,
        settings.answer_tolerance,
        settings.answer_case_sensitive,
    );
    if graded.is_empty() {
        return Err(validation("No questions were submitted."));
    }

    let total_credit: f64 = graded.iter().map(|g| g.credit).sum();
    let score = (total_credit / graded.len() as f64 * 1000.0).round() / 10.0;
    let correct = graded.iter().filter(|g| g.correct).count() as i64;
    let partial = graded.iter().filter(|g| !g.correct && g.partial).count() as i64;
    let incorrect = graded.len() as i64 - correct - partial;

    let mut kinds: Vec<String> = graded.iter().map(|g| g.kind.clone()).collect();
    kinds.sort();
    kinds.dedup();

    let id = new_id();
    sqlx::query(
        "INSERT INTO test_results
         (id, set_id, score, total, duration_seconds, question_types, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&set_id)
    .bind(score)
    .bind(graded.len() as i64)
    .bind(duration_seconds.max(0))
    .bind(kinds.join(","))
    .bind(serde_json::to_string(&graded)?)
    .bind(now_iso())
    .execute(&pool)
    .await?;

    // Record the test as a timed study session so study time stays accurate.
    let session_id = sessions::start(&pool, Some(set_id.clone()), "test").await?;
    sessions::finish(
        &pool,
        &session_id,
        graded.len() as i64,
        correct,
        incorrect,
        duration_seconds.max(0),
    )
    .await?;

    Ok(TestOutcome {
        id,
        score,
        total: graded.len() as i64,
        correct,
        partial,
        incorrect,
        questions: graded,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchingOutcome {
    pub best_seconds: f64,
    pub previous_best: Option<f64>,
    pub is_new_best: bool,
}

#[tauri::command]
pub async fn record_matching_result(
    state: State<'_, AppState>,
    set_id: String,
    seconds: f64,
    pairs: i64,
) -> AppResult<MatchingOutcome> {
    let pool = state.db().await;
    sets::get(&pool, &set_id).await?;
    let seconds = seconds.clamp(0.1, 86_400.0);

    let previous: Option<f64> =
        sqlx::query_scalar("SELECT best_seconds FROM matching_records WHERE set_id = ?")
            .bind(&set_id)
            .fetch_optional(&pool)
            .await?;

    let is_new_best = previous.map(|p| seconds < p - 0.001).unwrap_or(true);
    let best = match previous {
        Some(prev) if !is_new_best => prev,
        _ => {
            sqlx::query(
                "INSERT INTO matching_records (set_id, best_seconds, pairs, achieved_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(set_id) DO UPDATE SET best_seconds = excluded.best_seconds,
                    pairs = excluded.pairs, achieved_at = excluded.achieved_at",
            )
            .bind(&set_id)
            .bind(seconds)
            .bind(pairs.max(0))
            .bind(now_iso())
            .execute(&pool)
            .await?;
            seconds
        }
    };

    let session_id = sessions::start(&pool, Some(set_id.clone()), "matching").await?;
    sessions::finish(
        &pool,
        &session_id,
        pairs.max(0),
        pairs.max(0),
        0,
        seconds.round() as i64,
    )
    .await?;

    Ok(MatchingOutcome {
        best_seconds: best,
        previous_best: previous,
        is_new_best,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerFeedback {
    pub correct: bool,
    pub partial: bool,
    pub similarity: f64,
    pub expected: String,
    pub given: String,
    pub ai_feedback: Option<String>,
    pub ai_used: bool,
    pub ai_note: Option<String>,
}

#[tauri::command]
pub async fn check_card_answer(
    state: State<'_, AppState>,
    card_id: String,
    answer: String,
    use_ai: Option<bool>,
) -> AppResult<AnswerFeedback> {
    let pool = state.db().await;
    let settings = crate::settings::load(&pool).await?;
    let card = cards::get(&pool, &card_id).await?;

    let local = learning::check_answer(
        &card.back,
        &answer,
        settings.answer_tolerance,
        settings.answer_case_sensitive,
    );

    let mut feedback = AnswerFeedback {
        correct: local.correct,
        partial: local.partial,
        similarity: (local.similarity * 100.0).round() / 100.0,
        expected: local.expected,
        given: local.given,
        ai_feedback: None,
        ai_used: false,
        ai_note: None,
    };

    if use_ai.unwrap_or(false) && !local.correct {
        match providers::resolve(&pool, &state.vault, settings.default_provider_id.as_deref()).await
        {
            Ok((_, config)) => {
                let messages = vec![
                    client::ChatMessage {
                        role: "system".into(),
                        content: prompts::grade_system(),
                    },
                    client::ChatMessage {
                        role: "user".into(),
                        content: format!(
                            "Prompt: {}\nExpected answer: {}\nLearner answer: {}",
                            card.front, card.back, answer
                        ),
                    },
                ];
                match client::chat(&state.http, &config, &messages, Some(300), true).await {
                    Ok(raw) => match client::extract_json(&raw) {
                        Ok(value) => {
                            let verdict = value
                                .get("verdict")
                                .and_then(|v| v.as_str())
                                .unwrap_or("incorrect")
                                .to_string();
                            let note = value
                                .get("feedback")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            feedback.ai_feedback = note;
                            feedback.ai_used = true;
                            if verdict == "correct" {
                                feedback.correct = true;
                                feedback.partial = false;
                            } else if verdict == "partial" && !feedback.correct {
                                feedback.partial = true;
                                feedback.correct = false;
                            }
                        }
                        Err(err) => feedback.ai_note = Some(err.to_string()),
                    },
                    Err(err) => feedback.ai_note = Some(err.to_string()),
                }
            }
            Err(err) => feedback.ai_note = Some(err.to_string()),
        }
    }

    Ok(feedback)
}

#[tauri::command]
pub async fn reset_set_progress(state: State<'_, AppState>, set_id: String) -> AppResult<()> {
    let pool = state.db().await;
    sessions::reset_set(&pool, &set_id).await
}
