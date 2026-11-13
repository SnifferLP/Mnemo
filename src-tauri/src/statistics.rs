//! Aggregated learning statistics, all derived from local tables.
//!
//! Review counts and accuracy come from `card_reviews`; study time comes from
//! `study_sessions`, which every mode records (flashcards, adaptive, writing,
//! matching and tests). That keeps time accurate even for modes that do not
//! review cards individually.

use std::collections::{HashMap, HashSet};

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

/// Local calendar days covered by an activity range: oldest first, ending on
/// `today`.
///
/// Reports and charts both build their axis from this list: every entry is
/// exactly one day, so a bar can never be drawn next to a neighbouring date or
/// drift when a day has no activity at all.
pub fn activity_date_range(days: i64, today: NaiveDate) -> Vec<NaiveDate> {
    let days = days.clamp(1, 730);
    (0..days)
        .rev()
        .map(|offset| today - Duration::days(offset))
        .collect()
}

/// Local calendar day (`YYYY-MM-DD`) from a stored RFC3339 timestamp, matching
/// the `substr(datetime(..., 'localtime'), 1, 10)` grouping used in SQL.
fn local_day_expr(column: &str) -> String {
    format!("substr(datetime({column}, 'localtime'), 1, 10)")
}

async fn session_seconds_by_day(
    pool: &SqlitePool,
    first_day: &str,
) -> AppResult<HashMap<String, i64>> {
    let rows: Vec<(String, i64)> = sqlx::query_as(&format!(
        "SELECT {} AS day,
                COALESCE(SUM(duration_seconds), 0) AS seconds
         FROM study_sessions
         WHERE {} >= ? AND duration_seconds > 0
         GROUP BY day",
        local_day_expr("started_at"),
        local_day_expr("started_at")
    ))
    .bind(first_day)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

/// Daily review aggregates for the last `days` local days, oldest first.
pub async fn daily_activity(pool: &SqlitePool, days: i64) -> AppResult<Vec<DayActivity>> {
    let range = activity_date_range(days, Local::now().date_naive());
    let first_day = match range.first() {
        Some(day) => day.to_string(),
        None => return Ok(Vec::new()),
    };

    // The cutoff and the grouping use the same local calendar day, so the first
    // bar of the range is complete instead of being cut at a UTC timestamp.
    let rows: Vec<(String, i64, i64, i64)> = sqlx::query_as(&format!(
        "SELECT {} AS day,
                COUNT(*) AS reviews,
                SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END) AS correct,
                COUNT(DISTINCT card_id) AS cards
         FROM card_reviews
         WHERE {} >= ?
         GROUP BY day
         ORDER BY day",
        local_day_expr("created_at"),
        local_day_expr("created_at")
    ))
    .bind(&first_day)
    .fetch_all(pool)
    .await?;

    let mut sessions = session_seconds_by_day(pool, &first_day).await?;

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

    let mut out = Vec::with_capacity(range.len());
    for date in range {
        let key = date.to_string();
        out.push(by_day.remove(&key).unwrap_or(DayActivity {
            date: key,
            ..Default::default()
        }));
    }
    Ok(out)
}

/// Computes the current and longest consecutive-day streaks from a set of
/// local calendar days. Current still counts when the last activity was
/// yesterday, matching how dedicated learning apps let a streak survive until
/// the end of today.
pub fn streak_summary(days: &HashSet<NaiveDate>, today: NaiveDate) -> (i64, i64, bool) {
    let studied_today = days.contains(&today);
    let yesterday = today - Duration::days(1);
    let mut current = 0i64;
    if studied_today || days.contains(&yesterday) {
        let mut cursor = if studied_today { today } else { yesterday };
        while days.contains(&cursor) {
            current += 1;
            cursor -= Duration::days(1);
        }
    }

    let mut sorted: Vec<NaiveDate> = days.iter().copied().collect();
    sorted.sort_unstable();
    let mut longest = 0i64;
    let mut run = 0i64;
    let mut previous: Option<NaiveDate> = None;
    for day in sorted {
        run = match previous {
            Some(prev) if day == prev + Duration::days(1) => run + 1,
            _ => 1,
        };
        longest = longest.max(run);
        previous = Some(day);
    }

    (current, longest, studied_today)
}

async fn learning_day_streak(pool: &SqlitePool) -> AppResult<(i64, i64, bool)> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT day FROM learning_days")
        .fetch_all(pool)
        .await?;
    let days: HashSet<NaiveDate> = rows
        .iter()
        .filter_map(|(day,)| NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
        .collect();
    Ok(streak_summary(&days, Local::now().date_naive()))
}

pub async fn totals(pool: &SqlitePool, daily_goal: i64) -> AppResult<Totals> {
    let now = now_iso();
    let today = Local::now().date_naive().to_string();
    let week_ago =
        (Utc::now() - Duration::days(7)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let sets_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM study_sets WHERE archived_at IS NULL")
            .fetch_one(pool)
            .await?;
    let cards: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM flashcards f JOIN study_sets s ON s.id = f.set_id
         WHERE s.archived_at IS NULL",
    )
    .fetch_one(pool)
    .await?;
    let mastered: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM card_progress p JOIN study_sets s ON s.id = p.set_id
         WHERE s.archived_at IS NULL AND p.interval_days >= 21 AND p.correct_count >= 2",
    )
    .fetch_one(pool)
    .await?;
    let due_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM card_progress p JOIN study_sets s ON s.id = p.set_id
         WHERE s.archived_at IS NULL AND p.state <> 'new' AND p.due_at IS NOT NULL AND p.due_at <= ?",
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

    let (streak, longest_streak, studied_today) = learning_day_streak(pool).await?;
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
        longest_streak,
        studied_today,
        accuracy_7d,
        reviews_7d: week_row.0,
        study_minutes_7d: seconds_to_minutes(seconds_week),
        daily_goal: daily_goal.max(1),
        goal_progress: ((today_row.0 as f64 / daily_goal.max(1) as f64) * 100.0).min(100.0),
    })
}

pub async fn dashboard(pool: &SqlitePool, daily_goal: i64) -> AppResult<DashboardData> {
    let totals = totals(pool, daily_goal).await?;
    // Both set lists on the dashboard order by the same durable timestamp, so
    // the set opened last is always first, also after a restart.
    let all = sets::list_summaries(pool, None, None, None, false, false, "opened").await?;

    let recent: Vec<StudySetSummary> = all.iter().take(6).cloned().collect();

    // Every active set belongs here, not only the ones with cards due: a set
    // used to vanish from this section as soon as nothing was due in it.
    let continue_sets: Vec<StudySetSummary> = all.clone();

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
         FROM test_results t JOIN study_sets s ON s.id = t.set_id
         WHERE s.archived_at IS NULL
         ORDER BY t.created_at DESC LIMIT 5",
    )
    .fetch_all(pool)
    .await?;

    let recent_sessions: Vec<StudySession> = sqlx::query_as(
        "SELECT ss.* FROM study_sessions ss
         LEFT JOIN study_sets s ON s.id = ss.set_id
         WHERE ss.set_id IS NULL OR s.archived_at IS NULL
         ORDER BY ss.started_at DESC LIMIT 6",
    )
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
         WHERE s.archived_at IS NULL
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

    let bucket_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT p.state, COUNT(*) FROM card_progress p
         JOIN study_sets s ON s.id = p.set_id
         WHERE s.archived_at IS NULL GROUP BY p.state",
    )
    .fetch_all(pool)
    .await?;
    let mut buckets: HashMap<String, i64> = bucket_rows.into_iter().collect();
    let new_cards: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM flashcards f
         JOIN study_sets s ON s.id = f.set_id
         LEFT JOIN card_progress p ON p.card_id = f.id
         WHERE s.archived_at IS NULL AND (p.card_id IS NULL OR p.state = 'new')",
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

    // Reviews and sessions are history: a reset clears what the cards are due
    // for next, not what was learnt before, so the "Last 30 Days" chart and the
    // set's review history stay readable after a reset. Only test results are
    // reset-scoped.
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

    let range = activity_date_range(30, Local::now().date_naive());
    let first_day = range.first().map(|day| day.to_string()).unwrap_or_default();

    let daily_rows: Vec<(String, i64, i64, i64)> = sqlx::query_as(&format!(
        "SELECT {} AS day, COUNT(*),
                SUM(CASE WHEN outcome='correct' THEN 1 ELSE 0 END),
                COUNT(DISTINCT card_id)
         FROM card_reviews WHERE set_id = ? AND {} >= ?
         GROUP BY day ORDER BY day",
        local_day_expr("created_at"),
        local_day_expr("created_at")
    ))
    .bind(set_id)
    .bind(&first_day)
    .fetch_all(pool)
    .await?;

    let session_rows: Vec<(String, i64)> = sqlx::query_as(&format!(
        "SELECT {} AS day, COALESCE(SUM(duration_seconds),0)
         FROM study_sessions WHERE set_id = ? AND {} >= ? GROUP BY day",
        local_day_expr("started_at"),
        local_day_expr("started_at")
    ))
    .bind(set_id)
    .bind(&first_day)
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
    let mut daily = Vec::with_capacity(range.len());
    for date in range {
        let key = date.to_string();
        daily.push(by_day.remove(&key).unwrap_or_else(|| DayActivity {
            date: key.clone(),
            minutes: seconds_to_minutes(session_map.remove(&key).unwrap_or(0)),
            ..Default::default()
        }));
    }

    let tests: Vec<TestResultSummary> = sqlx::query_as(
        "SELECT t.id, t.set_id, s.title AS set_title, t.score, t.total, t.duration_seconds, t.created_at
         FROM test_results t LEFT JOIN study_sets s ON s.id = t.set_id
         WHERE t.set_id = ? AND t.hidden_by_reset = 0 ORDER BY t.created_at DESC LIMIT 10",
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

#[cfg(test)]
mod tests {
    use super::*;

    fn day(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").expect("valid test date")
    }

    fn days(values: &[&str]) -> HashSet<NaiveDate> {
        values.iter().map(|value| day(value)).collect()
    }

    #[test]
    fn consecutive_days_extend_current_and_longest_streak() {
        let summary = streak_summary(
            &days(&["2026-11-09", "2026-11-10", "2026-11-11"]),
            day("2026-11-11"),
        );
        assert_eq!(summary, (3, 3, true));
    }

    #[test]
    fn yesterday_keeps_the_current_streak_alive_until_today_ends() {
        let summary = streak_summary(&days(&["2026-11-09", "2026-11-10"]), day("2026-11-11"));
        assert_eq!(summary, (2, 2, false));
    }

    #[test]
    fn a_missed_day_breaks_the_current_streak_but_preserves_the_longest() {
        let summary = streak_summary(
            &days(&["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-11"]),
            day("2026-11-11"),
        );
        assert_eq!(summary, (1, 3, true));

        let stale = streak_summary(
            &days(&["2026-11-01", "2026-11-02", "2026-11-03"]),
            day("2026-11-11"),
        );
        assert_eq!(stale, (0, 3, false));
    }

    #[test]
    fn activity_range_covers_each_day_once_and_ends_today() {
        let today = day("2026-11-12");
        for (days, expected_first) in [
            (7, "2026-11-06"),
            (14, "2026-10-30"),
            (30, "2026-10-14"),
            (90, "2026-08-15"),
            (365, "2025-11-13"),
        ] {
            let range = activity_date_range(days, today);
            assert_eq!(range.len(), days as usize);
            assert_eq!(range.first().unwrap(), &day(expected_first));
            assert_eq!(range.last().unwrap(), &today);
            for pair in range.windows(2) {
                assert_eq!(pair[1] - pair[0], Duration::days(1));
            }
        }
    }

    #[test]
    fn activity_range_spans_quiet_weeks_and_month_boundaries() {
        // A range never skips days, so weeks without reviews still produce a
        // bar and a date column instead of collapsing the axis.
        let range = activity_date_range(10, day("2026-03-02"));
        let labels: Vec<String> = range.iter().map(|date| date.to_string()).collect();
        assert_eq!(
            labels,
            vec![
                "2026-02-21",
                "2026-02-22",
                "2026-02-23",
                "2026-02-24",
                "2026-02-25",
                "2026-02-26",
                "2026-02-27",
                "2026-02-28",
                "2026-03-01",
                "2026-03-02",
            ]
        );

        assert_eq!(activity_date_range(0, day("2026-03-02")).len(), 1);
        assert_eq!(activity_date_range(5_000, day("2026-03-02")).len(), 730);
    }

    #[test]
    fn streaks_cross_the_new_year_boundary() {
        let summary = streak_summary(
            &days(&["2025-12-30", "2025-12-31", "2026-01-01"]),
            day("2026-01-01"),
        );
        assert_eq!(summary, (3, 3, true));
    }
}
