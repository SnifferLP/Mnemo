//! Spaced repetition based on the SM-2 algorithm.
//!
//! Cards move through `new -> learning -> review`, with relearning triggered by
//! a wrong answer. Quality grades 5 (correct), 3 (partial) and 1 (incorrect) are
//! mapped onto the classic SM-2 easiness update.

use chrono::{DateTime, Duration, Utc};

use crate::db::iso;
use crate::models::CardProgress;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Correct,
    Partial,
    Incorrect,
}

impl Outcome {
    pub fn parse(value: &str) -> Self {
        match value {
            "correct" => Outcome::Correct,
            "partial" => Outcome::Partial,
            _ => Outcome::Incorrect,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Outcome::Correct => "correct",
            Outcome::Partial => "partial",
            Outcome::Incorrect => "incorrect",
        }
    }

    pub fn quality(self) -> i64 {
        match self {
            Outcome::Correct => 5,
            Outcome::Partial => 3,
            Outcome::Incorrect => 1,
        }
    }
}

/// Applies one review to a card's progress state.
pub fn apply_review(progress: &mut CardProgress, outcome: Outcome, now: DateTime<Utc>) {
    progress.last_reviewed_at = Some(iso(now));

    match outcome {
        Outcome::Incorrect => {
            progress.lapses += 1;
            progress.repetitions = 0;
            progress.learning_step = 0;
            progress.state = "relearning".into();
            progress.interval_days = 0.0;
            progress.ease_factor = (progress.ease_factor - 0.2).max(1.3);
            progress.wrong_count += 1;
            progress.streak = 0;
            progress.difficulty = (progress.difficulty + 0.12).min(1.0);
            // Re-show quickly inside the current session.
            progress.due_at = Some(iso(now + Duration::minutes(10)));
        }
        Outcome::Partial => {
            progress.repetitions = (progress.repetitions + 1).max(1);
            progress.learning_step += 1;
            progress.state = "learning".into();
            progress.interval_days = if progress.interval_days < 1.0 {
                0.5
            } else {
                progress.interval_days * 1.4
            };
            progress.ease_factor = (progress.ease_factor - 0.05).max(1.3);
            progress.correct_count += 1;
            progress.difficulty = (progress.difficulty - 0.03).clamp(0.0, 1.0);
            progress.due_at = Some(iso(now + Duration::minutes(45)));
        }
        Outcome::Correct => {
            progress.repetitions += 1;
            progress.streak += 1;
            progress.correct_count += 1;

            let interval = match progress.repetitions {
                1 => 1.0,
                2 => 3.0,
                _ => (progress.interval_days.max(1.0) * progress.ease_factor)
                    .round()
                    .clamp(1.0, 365.0),
            };
            progress.interval_days = interval;

            let q = outcome.quality() as f64;
            progress.ease_factor = (progress.ease_factor + 0.1
                - (5.0 - q) * (0.08 + (5.0 - q) * 0.02))
                .clamp(1.3, 3.0);
            progress.state = if interval >= 21.0 {
                "review".into()
            } else {
                "learning".into()
            };
            progress.difficulty = (progress.difficulty - 0.08).max(0.0);
            progress.due_at = Some(iso(now + Duration::days(interval.round() as i64)));
        }
    }
}

/// Normalised 0..1 mastery estimate used for progress bars and the adaptive
/// queue. Empty history means 0.
pub fn mastery(progress: &CardProgress) -> f64 {
    let total = progress.correct_count + progress.wrong_count;
    if total == 0 {
        return 0.0;
    }
    let accuracy = progress.correct_count as f64 / total as f64;
    let interval_score = (progress.interval_days / 30.0).clamp(0.0, 1.0);
    let reps_score = (progress.repetitions as f64 / 5.0).clamp(0.0, 1.0);
    (0.45 * interval_score + 0.3 * reps_score + 0.25 * accuracy).clamp(0.0, 1.0)
}

/// Mirrors the SQL predicate used for aggregate counts so dashboards and
/// per-card state always agree.
pub fn is_mastered(progress: &CardProgress) -> bool {
    progress.interval_days >= 21.0 && progress.correct_count >= 2
}

pub fn accuracy(progress: &CardProgress) -> f64 {
    let total = progress.correct_count + progress.wrong_count;
    if total == 0 {
        0.0
    } else {
        progress.correct_count as f64 / total as f64
    }
}

pub fn is_due(progress: &CardProgress, now: DateTime<Utc>) -> bool {
    match &progress.due_at {
        Some(raw) => DateTime::parse_from_rfc3339(raw)
            .map(|dt| dt.with_timezone(&Utc) <= now)
            .unwrap_or(true),
        None => progress.state == "new",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> CardProgress {
        CardProgress {
            card_id: "c".into(),
            set_id: "s".into(),
            ease_factor: 2.5,
            interval_days: 0.0,
            repetitions: 0,
            lapses: 0,
            learning_step: 0,
            state: "new".into(),
            due_at: None,
            last_reviewed_at: None,
            correct_count: 0,
            wrong_count: 0,
            difficulty: 0.5,
            streak: 0,
        }
    }

    #[test]
    fn correct_answers_grow_the_interval() {
        let now = Utc::now();
        let mut p = fresh();
        apply_review(&mut p, Outcome::Correct, now);
        assert_eq!(p.interval_days, 1.0);
        assert_eq!(p.state, "learning");

        apply_review(&mut p, Outcome::Correct, now);
        assert_eq!(p.interval_days, 3.0);

        apply_review(&mut p, Outcome::Correct, now);
        assert_eq!(p.interval_days, 8.0);

        apply_review(&mut p, Outcome::Correct, now);
        assert!(p.interval_days > 20.0);
        assert_eq!(p.state, "review");
        assert!(is_mastered(&p));
    }

    #[test]
    fn wrong_answer_resets_repetitions_and_mastery() {
        let now = Utc::now();
        let mut p = fresh();
        for _ in 0..4 {
            apply_review(&mut p, Outcome::Correct, now);
        }
        assert!(mastery(&p) > 0.4);
        let ease_before = p.ease_factor;
        assert!(
            ease_before > 2.5,
            "correct reviews should raise the ease factor"
        );

        apply_review(&mut p, Outcome::Incorrect, now);
        assert_eq!(p.repetitions, 0);
        assert_eq!(p.state, "relearning");
        assert_eq!(p.lapses, 1);
        assert!(p.ease_factor < ease_before);
        assert!(!is_mastered(&p));
    }

    #[test]
    fn partial_answers_stay_in_learning() {
        let now = Utc::now();
        let mut p = fresh();
        apply_review(&mut p, Outcome::Partial, now);
        assert_eq!(p.state, "learning");
        assert!(p.correct_count == 1);
        assert!(!is_mastered(&p));
    }
}
