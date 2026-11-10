//! Aggregated learning statistics, all derived from local tables.
//!
//! Review counts and accuracy come from `card_reviews`; study time comes from
//! `study_sessions`, which every mode records (flashcards, adaptive, writing,
//! matching and tests). That keeps time accurate even for modes that do not
//! review cards individually.

use std::collections::HashMap;

use chrono::{Duration, Local, NaiveDate, Utc};
use sqlx::SqlitePool;

use crate::db::now_iso;
use crate::error::AppResult;
use crate::models::{
    DashboardData, DayActivity, MasteryBucket, ModeStat, SetStat, StudySession, StudySetSummary,
    TestResultSummary, Totals,
};
use crate::services::sets;

type SetStatRow = (String, String, i64, i64, i64, i64, i64, i64);
type CardDetailRow = (
    String,
    String,
    String,
    Option<String>,
    i64,
    i64,
    f64,
    Option<String>,
    i64,
    f64,
);

fn seconds_to_minutes(seconds: i64) -> f64 {
    (seconds as f64 / 60.0 * 10.0).round() / 10.0
}

async fn session_seconds_by_day(
    pool: &SqlitePool,
    since_iso: &str,
) -> AppResult<HashMap<String, i64>> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT substr(datetime(started_at, 'localtime'), 1, 10) AS day,
                COALESCE(SUM(duration_seconds), 0) AS seconds
         FROM study_sessions
         WHERE started_at >= ? AND duration_seconds > 0
         GROUP BY day",
    )
    .bind(since_iso)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

/// Daily review aggregates for the last `days` days, oldest first.
pub async fn daily_activity(pool: &SqlitePool, days: i64) -> AppResult<Vec<DayActivity>> {
    let days = days.clamp(1, 730);
    let start = Utc::now() - Duration::days(days);
    let start_iso = start.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let rows: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT substr(datetime(created_at, 'localtime'), 1, 10) AS day,
                COUNT(*) AS reviews,
                SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END) AS correct,
                COUNT(DISTINCT card_id) AS cards
         FROM card_reviews
         WHERE created_at >= ?
         GROUP BY day
         ORDER BY day",
    )
    .bind(&start_iso)
    .fetch_all(pool)
    .await?;

    let mut sessions = session_seconds_by_day(pool, &start_iso).await?;

    let mut by_day: HashMap<String, DayActivity> = HashMap::new();
    for (date, reviews, correct, cards) in rows {
        let minutes = seconds_to_minutes(sessions.remove(&date).unwrap_or(0));
        by_day.insert(
            date.clone(),
            DayActivity {
                date,
                reviews,
                correct,
                minutes,
                cards,
            },
        );
    }
    for (date, seconds) in sessions {
        by_day.insert(
            date.clone(),
            DayActivity {
                date,
                minutes: seconds_to_minutes(seconds),
                ..Default::default()
            },
        );
    }

    let today = Local::now().date_naive();
    let mut out = Vec::with_capacity(days as usize);
    for offset in (0..days).rev() {
        let date = today - Duration::days(offset);
        let key = date.to_string();
        out.push(by_day.remove(&key).unwrap_or(DayActivity {
            date: key,
            ..Default::default()
        }));
    }
    Ok(out)
}

async fn streak_days(pool: &SqlitePool) -> AppResult<i64> {
    // A day counts when there was either a review or a completed session.
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT day FROM (
            SELECT substr(datetime(created_at, 'localtime'), 1, 10) AS day FROM card_reviews
            UNION
            SELECT substr(datetime(started_at, 'localtime'), 1, 10) AS day
              FROM study_sessions WHERE duration_seconds >= 60
         ) ORDER BY day DESC",
    )
    .fetch_all(pool)
    .await?;

    let mut days: Vec<NaiveDate> = rows
        .iter()
        .filter_map(|(d,)| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .collect();
    days.sort_unstable_by(|a, b| b.cmp(a));

    let today = Local::now().date_naive();
    let mut cursor = if days.first() == Some(&today) {
        today
    } else {
        today.pred_opt().unwrap_or(today)
    };

    let mut streak = 0;
    for day in days {
        if day == cursor {
            streak += 1;
            match cursor.pred_opt() {
                Some(prev) => cursor = prev,
                None => break,
            }
        } else if day < cursor {
            break;
        }
    }
    Ok(streak)
}

pub async fn totals(pool: &SqlitePool, daily_goal: i64) -> AppResult<Totals> {
    let now = now_iso();
    let today = Local::now().date_naive().to_string();
    let week_ago =
        (Utc::now() - Duration::days(7)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let sets_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM study_sets")
        .fetch_one(pool)
        .await?;
    let cards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM flashcards")
        .fetch_one(pool)
        .await?;
    let mastered: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM card_progress WHERE interval_days >= 21 AND correct_count >= 2",
    )
    .fetch_one(pool)
    .await?;
    let due_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM card_progress WHERE state <> 'new' AND due_at IS NOT NULL AND due_at <= ?",
    )
    .bind(&now)
    .fetch_one(pool)
    .await?;

    let today_row: (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END), 0)
         FROM card_reviews
         WHERE substr(datetime(created_at, 'localtime'), 1, 10) = ?",
    )
    .bind(&today)
    .fetch_one(pool)
    .await?;

    let seconds_today: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM study_sessions
         WHERE substr(datetime(started_at, 'localtime'), 1, 10) = ?",
    )
    .bind(&today)
    .fetch_one(pool)
    .await?;

    let week_row: (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END), 0)
         FROM card_reviews WHERE created_at >= ?",
    )
    .bind(&week_ago)
    .fetch_one(pool)
    .await?;

    let seconds_week: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM study_sessions WHERE started_at >= ?",
    )
    .bind(&week_ago)
    .fetch_one(pool)
    .await?;

    let streak = streak_days(pool).await?;
    let accuracy_7d = if week_row.0 == 0 {
        0.0
    } else {
        (week_row.1 as f64 / week_row.0 as f64 * 1000.0).round() / 10.0
    };

    Ok(Totals {
        sets: sets_count,
        cards,
        mastered,
        due_today,
        reviews_today: today_row.0,
        correct_today: today_row.1,
        minutes_today: seconds_to_minutes(seconds_today),
        streak_days: streak,
        accuracy_7d,
        reviews_7d: week_row.0,
        study_minutes_7d: seconds_to_minutes(seconds_week),
        daily_goal: daily_goal.max(1),
        goal_progress: ((today_row.0 as f64 / daily_goal.max(1) as f64) * 100.0).min(100.0),
    })
}

pub async fn dashboard(pool: &SqlitePool, daily_goal: i64) -> AppResult<DashboardData> {
    let totals = totals(pool, daily_goal).await?;
    let all = sets::list_summaries(pool, None, None, None, false, "studied").await?;

    let mut recent: Vec<StudySetSummary> = all
        .iter()
        .filter(|s| s.last_studied_at.is_some())
        .take(6)
        .cloned()
        .collect();
    if recent.is_empty() {
        recent = all.iter().take(6).cloned().collect();
    }

    let mut continue_sets: Vec<StudySetSummary> = all
        .iter()
        .filter(|s| s.due_count > 0 && s.card_count > 0)
        .cloned()
        .collect();
    continue_sets.sort_by_key(|a| std::cmp::Reverse(a.due_count));
    continue_sets.truncate(4);

    let favorites: Vec<StudySetSummary> = all
        .iter()
        .filter(|s| s.is_favorite)
        .take(6)
        .cloned()
        .collect();

    let mut due_sets: Vec<StudySetSummary> =
        all.iter().filter(|s| s.due_count > 0).cloned().collect();
    due_sets.sort_by_key(|a| std::cmp::Reverse(a.due_count));
    due_sets.truncate(5);

    let activity = daily_activity(pool, 14).await?;

    let recent_tests: Vec<TestResultSummary> = sqlx::query_as(
        "SELECT t.id, t.set_id, s.title AS set_title, t.score, t.total, t.duration_seconds, t.created_at
         FROM test_results t LEFT JOIN study_sets s ON s.id = t.set_id
         ORDER BY t.created_at DESC LIMIT 5",
    )
    .fetch_all(pool)
    .await?;

    let recent_sessions: Vec<StudySession> =
        sqlx::query_as("SELECT * FROM study_sessions ORDER BY started_at DESC LIMIT 6")
            .fetch_all(pool)
            .await?;

    Ok(DashboardData {
        totals,
        recent_sets: recent,
        continue_sets,
        favorites,
        reviews_due: due_sets,
        activity,
        recent_tests,
        recent_sessions,
    })
}

pub async fn statistics(
    pool: &SqlitePool,
    days: i64,
    daily_goal: i64,
) -> AppResult<crate::models::StatisticsData> {
    let days = days.clamp(7, 365);
    let start = Utc::now() - Duration::days(days);
    let start_iso = start.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let now = now_iso();

    let totals = totals(pool, daily_goal).await?;
    let daily = daily_activity(pool, days).await?;

    let mode_rows: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT mode, COUNT(*), COALESCE(SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END), 0)
         FROM card_reviews WHERE created_at >= ? GROUP BY mode ORDER BY COUNT(*) DESC",
    )
    .bind(&start_iso)
    .fetch_all(pool)
    .await?;
    let session_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT mode, COALESCE(SUM(duration_seconds), 0) FROM study_sessions
         WHERE started_at >= ? GROUP BY mode",
    )
    .bind(&start_iso)
    .fetch_all(pool)
    .await?;
    let mut session_map: HashMap<String, i64> = session_rows.into_iter().collect();

    let mut modes: Vec<ModeStat> = mode_rows
        .into_iter()
        .map(|(mode, reviews, correct)| ModeStat {
            minutes: seconds_to_minutes(session_map.remove(&mode).unwrap_or(0)),
            mode,
            reviews,
            correct,
        })
        .collect();
    for (mode, seconds) in session_map {
        modes.push(ModeStat {
            mode,
            reviews: 0,
            correct: 0,
            minutes: seconds_to_minutes(seconds),
        });
    }
    modes.sort_by(|a, b| {
        b.minutes
            .partial_cmp(&a.minutes)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let set_rows: Vec<SetStatRow> = sqlx::query_as(
        "SELECT s.id, s.title,
                (SELECT COUNT(*) FROM flashcards f WHERE f.set_id = s.id) AS cards,
                (SELECT COUNT(*) FROM card_progress p WHERE p.set_id = s.id AND p.interval_days >= 21 AND p.correct_count >= 2) AS mastered,
                (SELECT COUNT(*) FROM card_progress p WHERE p.set_id = s.id AND p.state <> 'new' AND p.due_at IS NOT NULL AND p.due_at <= ?1) AS due,
                (SELECT COUNT(*) FROM card_reviews r WHERE r.set_id = s.id AND r.created_at >= ?2) AS reviews,
                (SELECT COUNT(*) FROM card_reviews r WHERE r.set_id = s.id AND r.created_at >= ?2 AND r.outcome = 'correct') AS correct,
                (SELECT COALESCE(SUM(ss.duration_seconds), 0) FROM study_sessions ss WHERE ss.set_id = s.id AND ss.started_at >= ?2) AS seconds
         FROM study_sets s
         ORDER BY reviews DESC, s.title COLLATE NOCASE",
    )
    .bind(&now)
    .bind(&start_iso)
    .fetch_all(pool)
    .await?;

    let sets_stats = set_rows
        .into_iter()
        .map(
            |(set_id, title, cards, mastered, due, reviews, correct, seconds)| SetStat {
                set_id,
                title,
                cards,
                mastered,
                due,
                reviews,
                accuracy: if reviews == 0 {
                    0.0
                } else {
                    (correct as f64 / reviews as f64 * 1000.0).round() / 10.0
                },
                minutes: seconds_to_minutes(seconds),
            },
        )
        .collect();

    let bucket_rows: Vec<(String, i64)> =
        sqlx::query_as("SELECT state, COUNT(*) FROM card_progress GROUP BY state")
            .fetch_all(pool)
            .await?;
    let mut buckets: HashMap<String, i64> = bucket_rows.into_iter().collect();
    let new_cards: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM flashcards f LEFT JOIN card_progress p ON p.card_id = f.id
         WHERE p.card_id IS NULL OR p.state = 'new'",
    )
    .fetch_one(pool)
    .await?;

    let mastery_buckets = vec![
        MasteryBucket {
            label: "Not started".into(),
            count: new_cards,
            color: "muted".into(),
        },
        MasteryBucket {
            label: "Learning".into(),
            count: buckets.remove("learning").unwrap_or(0),
            color: "warning".into(),
        },
        MasteryBucket {
            label: "Relearning".into(),
            count: buckets.remove("relearning").unwrap_or(0),
            color: "destructive".into(),
        },
        MasteryBucket {
            label: "Mature".into(),
            count: buckets.remove("review").unwrap_or(0),
            color: "success".into(),
        },
    ];

    Ok(crate::models::StatisticsData {
        totals,
        daily,
        modes,
        sets: sets_stats,
        mastery_buckets,
        range_days: days,
    })
}

pub async fn set_statistics(
    pool: &SqlitePool,
    set_id: &str,
) -> AppResult<crate::models::SetStatistics> {
    let set: Option<(String, String)> =
        sqlx::query_as("SELECT id, title FROM study_sets WHERE id = ?")
            .bind(set_id)
            .fetch_optional(pool)
            .await?;
    let (_, title) = set.ok_or_else(|| crate::error::not_found("study set"))?;

    let now = now_iso();
    let cards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM flashcards WHERE set_id = ?")
        .bind(set_id)
        .fetch_one(pool)
        .await?;
    let mastered: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM card_progress WHERE set_id = ? AND interval_days >= 21 AND correct_count >= 2",
    )
    .bind(set_id)
    .fetch_one(pool)
    .await?;
    let learning: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM card_progress WHERE set_id = ? AND state IN ('learning','relearning')",
    )
    .bind(set_id)
    .fetch_one(pool)
    .await?;
    let new_cards: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM flashcards f LEFT JOIN card_progress p ON p.card_id = f.id
         WHERE f.set_id = ? AND (p.card_id IS NULL OR p.state = 'new')",
    )
    .bind(set_id)
    .fetch_one(pool)
    .await?;
    let due: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM card_progress WHERE set_id = ? AND state <> 'new' AND due_at IS NOT NULL AND due_at <= ?",
    )
    .bind(set_id)
    .bind(&now)
    .fetch_one(pool)
    .await?;

    let review_row: (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN outcome='correct' THEN 1 ELSE 0 END),0)
         FROM card_reviews WHERE set_id = ?",
    )
    .bind(set_id)
    .fetch_one(pool)
    .await?;
    let seconds: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM study_sessions WHERE set_id = ?",
    )
    .bind(set_id)
    .fetch_one(pool)
    .await?;

    let daily_rows: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT substr(datetime(created_at,'localtime'),1,10) AS day, COUNT(*),
                SUM(CASE WHEN outcome='correct' THEN 1 ELSE 0 END),
                COUNT(DISTINCT card_id)
         FROM card_reviews WHERE set_id = ? AND created_at >= ?
         GROUP BY day ORDER BY day",
    )
    .bind(set_id)
    .bind((Utc::now() - Duration::days(60)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    .fetch_all(pool)
    .await?;

    let session_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT substr(datetime(started_at,'localtime'),1,10) AS day, COALESCE(SUM(duration_seconds),0)
         FROM study_sessions WHERE set_id = ? AND started_at >= ? GROUP BY day",
    )
    .bind(set_id)
    .bind((Utc::now() - Duration::days(30)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    .fetch_all(pool)
    .await?;
    let mut session_map: HashMap<String, i64> = session_rows.into_iter().collect();

    let mut by_day: HashMap<String, DayActivity> = HashMap::new();
    for (date, reviews, correct, cards_touched) in daily_rows {
        let minutes = seconds_to_minutes(session_map.remove(&date).unwrap_or(0));
        by_day.insert(
            date.clone(),
            DayActivity {
                date,
                reviews,
                correct,
                minutes,
                cards: cards_touched,
            },
        );
    }
    let today = Local::now().date_naive();
    let mut daily = Vec::new();
    for offset in (0..30).rev() {
        let date = (today - Duration::days(offset)).to_string();
        daily.push(by_day.remove(&date).unwrap_or_else(|| DayActivity {
            date: date.clone(),
            minutes: seconds_to_minutes(session_map.remove(&date).unwrap_or(0)),
            ..Default::default()
        }));
    }

    let tests: Vec<TestResultSummary> = sqlx::query_as(
        "SELECT t.id, t.set_id, s.title AS set_title, t.score, t.total, t.duration_seconds, t.created_at
         FROM test_results t LEFT JOIN study_sets s ON s.id = t.set_id
         WHERE t.set_id = ? ORDER BY t.created_at DESC LIMIT 10",
    )
    .bind(set_id)
    .fetch_all(pool)
    .await?;

    let matching_best: Option<f64> =
        sqlx::query_scalar("SELECT best_seconds FROM matching_records WHERE set_id = ?")
            .bind(set_id)
            .fetch_optional(pool)
            .await?;

    let detail_rows: Vec<CardDetailRow> = sqlx::query_as(
        "SELECT f.id, f.front, f.back, p.state, COALESCE(p.correct_count,0), COALESCE(p.wrong_count,0),
                COALESCE(p.interval_days,0), p.due_at, COALESCE(p.repetitions,0), COALESCE(p.ease_factor, 2.5)
         FROM flashcards f LEFT JOIN card_progress p ON p.card_id = f.id
         WHERE f.set_id = ? ORDER BY f.position, f.created_at",
    )
    .bind(set_id)
    .fetch_all(pool)
    .await?;

    let cards_detail = detail_rows
        .into_iter()
        .map(
            |(card_id, front, back, state, correct, wrong, interval, due_at, reps, ease)| {
                let progress = crate::models::CardProgress {
                    card_id: card_id.clone(),
                    set_id: set_id.to_string(),
                    ease_factor: ease,
                    interval_days: interval,
                    repetitions: reps,
                    lapses: 0,
                    learning_step: 0,
                    state: state.clone().unwrap_or_else(|| "new".into()),
                    due_at: due_at.clone(),
                    last_reviewed_at: None,
                    correct_count: correct,
                    wrong_count: wrong,
                    difficulty: 0.5,
                    streak: 0,
                };
                crate::models::CardStat {
                    card_id,
                    front,
                    back,
                    state: progress.state.clone(),
                    mastery: crate::spaced_repetition::mastery(&progress),
                    correct,
                    wrong,
                    interval_days: interval,
                    due_at,
                }
            },
        )
        .collect();

    Ok(crate::models::SetStatistics {
        set_id: set_id.to_string(),
        title,
        cards,
        mastered,
        learning,
        new_cards,
        due,
        accuracy: if review_row.0 == 0 {
            0.0
        } else {
            (review_row.1 as f64 / review_row.0 as f64 * 1000.0).round() / 10.0
        },
        reviews: review_row.0,
        minutes: seconds_to_minutes(seconds),
        daily,
        tests,
        matching_best,
        cards_detail,
    })
}
