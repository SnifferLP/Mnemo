//! Learning engine: queue selection, test generation, answer grading.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

use crate::db::new_id;
use crate::error::{validation, AppError, AppResult};
use crate::models::{CardProgress, StudyCard};
use crate::spaced_repetition::{is_due, mastery};

/// Small deterministic-shuffle RNG (xorshift64) so test generation does not
/// need an extra dependency.
pub struct Rng(u64);

impl Rng {
    pub fn seeded() -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        Self((nanos ^ 0x9E37_79B9_7F4A_7C15) | 1)
    }

    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    pub fn below(&mut self, n: usize) -> usize {
        if n == 0 {
            0
        } else {
            (self.next() % n as u64) as usize
        }
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i + 1);
            items.swap(i, j);
        }
    }
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------

pub fn normalize(input: &str) -> String {
    let lowered = input
        .nfkd()
        .flat_map(|c| c.to_lowercase())
        .collect::<String>();
    let stripped = lowered
        .chars()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect::<String>();
    stripped
        .replace(['\u{2019}', '\u{2018}'], "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|c: char| c == '.' || c == ',' || c == '!' || c == '?' || c == ';')
        .to_string()
}

pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerCheck {
    pub correct: bool,
    pub partial: bool,
    pub similarity: f64,
    pub expected: String,
    pub given: String,
}

/// Compares a typed answer against the expected one.
///
/// `tolerance`: 0 = exact, 1 = small typos, 2 = fuzzy (85 % similarity).
pub fn check_answer(
    expected: &str,
    given: &str,
    tolerance: i64,
    case_sensitive: bool,
) -> AnswerCheck {
    let exp_raw = if case_sensitive {
        expected.trim().to_string()
    } else {
        normalize(expected)
    };
    let got_raw = if case_sensitive {
        given.trim().to_string()
    } else {
        normalize(given)
    };

    let mut best_similarity: f64 = 0.0;
    let mut best_correct = false;
    let mut best_partial = false;

    for alternative in expected.split([';', '/', '|']) {
        let alt = if case_sensitive {
            alternative.trim().to_string()
        } else {
            normalize(alternative)
        };
        if alt.is_empty() {
            continue;
        }
        if alt == got_raw {
            return AnswerCheck {
                correct: true,
                partial: false,
                similarity: 1.0,
                expected: exp_raw.clone(),
                given: got_raw.clone(),
            };
        }
        let distance = levenshtein(&alt, &got_raw);
        let longest = alt.chars().count().max(got_raw.chars().count()).max(1);
        let similarity = 1.0 - (distance as f64 / longest as f64);
        let allowed = match tolerance {
            0 => 0,
            1 => (longest / 6).max(1),
            _ => (longest / 4).max(2),
        };
        if distance <= allowed && similarity >= 0.6 {
            best_correct = true;
        } else if similarity >= 0.82 && got_raw.len() > 2 {
            best_partial = true;
        }
        best_similarity = best_similarity.max(similarity.clamp(0.0, 1.0));
    }

    AnswerCheck {
        correct: best_correct,
        partial: !best_correct && best_partial,
        similarity: best_similarity,
        expected: exp_raw,
        given: got_raw,
    }
}

// ---------------------------------------------------------------------------
// Study queue
// ---------------------------------------------------------------------------

/// Orders cards for a mode. `adaptive` weights weak/overdue cards higher;
/// `spaced` returns only due cards ordered by due date.
pub fn select_queue(cards: Vec<StudyCard>, mode: &str, limit: usize) -> Vec<StudyCard> {
    let now: DateTime<Utc> = Utc::now();
    let mut rng = Rng::seeded();
    let mut result = cards;

    match mode {
        "spaced" => {
            result.retain(|c| is_due(&c.progress, now) || c.progress.state == "new");
            result.sort_by(|a, b| {
                let da = a.progress.due_at.clone().unwrap_or_default();
                let db = b.progress.due_at.clone().unwrap_or_default();
                da.cmp(&db)
            });
        }
        "adaptive" => {
            let mut weighted: Vec<(f64, StudyCard)> = result
                .into_iter()
                .map(|card| {
                    let accuracy_total = card.progress.correct_count + card.progress.wrong_count;
                    let wrong_ratio = if accuracy_total == 0 {
                        0.25
                    } else {
                        card.progress.wrong_count as f64 / accuracy_total as f64
                    };
                    let overdue = if is_due(&card.progress, now) {
                        0.35
                    } else {
                        0.0
                    };
                    let fresh = if card.progress.state == "new" {
                        0.2
                    } else {
                        0.0
                    };
                    let unseen_bonus = if accuracy_total == 0 { 0.3 } else { 0.0 };
                    let mut weight = (1.0 - mastery(&card.progress)) * 0.55
                        + wrong_ratio * 0.25
                        + overdue
                        + fresh
                        + unseen_bonus
                        + card.progress.difficulty * 0.2;
                    weight += (rng.below(1000) as f64 / 1000.0) * 0.08;
                    (weight, card)
                })
                .collect();
            weighted.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
            result = weighted.into_iter().map(|(_, c)| c).collect();
        }
        "weak" => {
            result.retain(|c| {
                let total = c.progress.correct_count + c.progress.wrong_count;
                total > 0 && c.progress.wrong_count as f64 / total as f64 > 0.3
            });
            result.sort_by(|a, b| {
                mastery(&a.progress)
                    .partial_cmp(&mastery(&b.progress))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        _ => {
            if mode == "shuffle" {
                rng.shuffle(&mut result);
            }
        }
    }

    if limit > 0 {
        result.truncate(limit);
    }
    result
}

// ---------------------------------------------------------------------------
// Test generation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConfig {
    #[serde(default)]
    pub question_types: Vec<String>,
    #[serde(default = "default_count")]
    pub count: usize,
    #[serde(default)]
    pub time_limit_seconds: Option<i64>,
}

fn default_count() -> usize {
    10
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestPair {
    pub left: String,
    pub right: String,
    pub option_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestQuestion {
    pub id: String,
    pub kind: String,
    pub card_id: String,
    pub prompt: String,
    pub options: Vec<String>,
    pub correct_index: Option<usize>,
    pub correct_answer: String,
    #[serde(default)]
    pub pairs: Vec<TestPair>,
    #[serde(default)]
    pub explanation: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TestAnswer {
    pub question_id: String,
    pub text: Option<String>,
    pub option_index: Option<usize>,
    pub mapping: Option<Vec<usize>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradedQuestion {
    pub question_id: String,
    pub card_id: String,
    pub kind: String,
    pub prompt: String,
    pub user_answer: String,
    pub correct_answer: String,
    pub correct: bool,
    pub partial: bool,
    pub credit: f64,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestOutcome {
    pub id: String,
    pub score: f64,
    pub total: i64,
    pub correct: i64,
    pub partial: i64,
    pub incorrect: i64,
    pub questions: Vec<GradedQuestion>,
}

const ALL_TYPES: [&str; 5] = [
    "multiple_choice",
    "true_false",
    "free_text",
    "fill_blank",
    "matching",
];

fn usable(cards: &[StudyCard]) -> Vec<&StudyCard> {
    cards
        .iter()
        .filter(|c| !c.card.front.trim().is_empty() && !c.card.back.trim().is_empty())
        .collect()
}

fn distractors(pool: &[&StudyCard], exclude_id: &str, rng: &mut Rng, amount: usize) -> Vec<String> {
    let mut candidates: Vec<String> = Vec::new();
    let mut pool = pool.to_vec();
    rng.shuffle(&mut pool);
    for card in pool {
        if card.card.id == exclude_id {
            continue;
        }
        let back = card.card.back.trim().to_string();
        if back.is_empty() {
            continue;
        }
        if !candidates.iter().any(|c| normalize(c) == normalize(&back)) {
            candidates.push(back);
        }
        if candidates.len() >= amount {
            break;
        }
    }
    candidates
}

fn blank_word(back: &str) -> Option<(String, String)> {
    let mut best: Option<(usize, String)> = None;
    for (index, word) in back.split_whitespace().enumerate() {
        let cleaned: String = word.chars().filter(|c| c.is_alphanumeric()).collect();
        if cleaned.chars().count() >= 5 && cleaned.chars().all(|c| !c.is_numeric()) {
            let better = best
                .as_ref()
                .map(|(_, w)| cleaned.len() > w.len())
                .unwrap_or(true);
            if better {
                best = Some((index, cleaned));
            }
        }
    }
    best.map(|(index, word)| {
        let mut parts = back
            .split_whitespace()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        parts[index] = "______".into();
        (parts.join(" "), word)
    })
}

/// Builds a practice test from the given cards.
pub fn generate_test(cards: &[StudyCard], config: &TestConfig) -> AppResult<Vec<TestQuestion>> {
    let pool = usable(cards);
    if pool.is_empty() {
        return Err(validation(
            "This study set needs cards with a front and back before a test can be generated.",
        ));
    }

    let requested: Vec<String> = if config.question_types.is_empty() {
        ALL_TYPES.iter().map(|s| s.to_string()).collect()
    } else {
        config
            .question_types
            .iter()
            .filter(|t| ALL_TYPES.contains(&t.as_str()))
            .cloned()
            .collect()
    };
    if requested.is_empty() {
        return Err(validation("Select at least one question type."));
    }

    let total = config.count.clamp(1, 60);
    let mut rng = Rng::seeded();
    let mut order: Vec<&StudyCard> = pool.clone();
    rng.shuffle(&mut order);

    let mut questions: Vec<TestQuestion> = Vec::new();
    let mut cursor = 0usize;

    while questions.len() < total {
        let kind = &requested[questions.len() % requested.len()];
        let card = order[cursor % order.len()];
        cursor += 1;

        match kind.as_str() {
            "multiple_choice" => {
                let mut options = vec![card.card.back.clone()];
                options.extend(distractors(&pool, &card.card.id, &mut rng, 3));
                if options.len() < 2 {
                    continue;
                }
                rng.shuffle(&mut options);
                let correct_index = options
                    .iter()
                    .position(|o| normalize(o) == normalize(&card.card.back))
                    .unwrap_or(0);
                questions.push(TestQuestion {
                    id: new_id(),
                    kind: kind.clone(),
                    card_id: card.card.id.clone(),
                    prompt: card.card.front.clone(),
                    options,
                    correct_index: Some(correct_index),
                    correct_answer: card.card.back.clone(),
                    pairs: vec![],
                    explanation: card.card.explanation.clone(),
                });
            }
            "true_false" => {
                let use_correct = rng.below(2) == 0;
                let candidate = if use_correct {
                    card.card.back.clone()
                } else if let Some(other) = distractors(&pool, &card.card.id, &mut rng, 1).first() {
                    other.clone()
                } else {
                    card.card.back.clone()
                };
                let is_true = normalize(&candidate) == normalize(&card.card.back);
                questions.push(TestQuestion {
                    id: new_id(),
                    kind: kind.clone(),
                    card_id: card.card.id.clone(),
                    prompt: format!("{}  →  {}", card.card.front, candidate),
                    options: vec!["True".into(), "False".into()],
                    correct_index: Some(if is_true { 0 } else { 1 }),
                    correct_answer: if is_true {
                        "True".into()
                    } else {
                        "False".into()
                    },
                    pairs: vec![],
                    explanation: card.card.explanation.clone(),
                });
            }
            "free_text" => {
                questions.push(TestQuestion {
                    id: new_id(),
                    kind: kind.clone(),
                    card_id: card.card.id.clone(),
                    prompt: card.card.front.clone(),
                    options: vec![],
                    correct_index: None,
                    correct_answer: card.card.back.clone(),
                    pairs: vec![],
                    explanation: card.card.explanation.clone(),
                });
            }
            "fill_blank" => {
                if let Some((blanked, word)) = blank_word(&card.card.back) {
                    questions.push(TestQuestion {
                        id: new_id(),
                        kind: kind.clone(),
                        card_id: card.card.id.clone(),
                        prompt: format!("{} — {}", card.card.front, blanked),
                        options: vec![],
                        correct_index: None,
                        correct_answer: word,
                        pairs: vec![],
                        explanation: card.card.explanation.clone(),
                    });
                } else {
                    questions.push(TestQuestion {
                        id: new_id(),
                        kind: "free_text".into(),
                        card_id: card.card.id.clone(),
                        prompt: card.card.front.clone(),
                        options: vec![],
                        correct_index: None,
                        correct_answer: card.card.back.clone(),
                        pairs: vec![],
                        explanation: card.card.explanation.clone(),
                    });
                }
            }
            "matching" => {
                let mut group: Vec<&StudyCard> = Vec::new();
                for offset in 0..4 {
                    let candidate = order[(cursor - 1 + offset) % order.len()];
                    if !group.iter().any(|c| c.card.id == candidate.card.id) {
                        group.push(candidate);
                    }
                }
                if group.len() < 2 {
                    continue;
                }
                let mut rights: Vec<String> = group.iter().map(|c| c.card.back.clone()).collect();
                rng.shuffle(&mut rights);
                let pairs: Vec<TestPair> = group
                    .iter()
                    .map(|c| {
                        let option_index = rights
                            .iter()
                            .position(|r| normalize(r) == normalize(&c.card.back))
                            .unwrap_or(0);
                        TestPair {
                            left: c.card.front.clone(),
                            right: c.card.back.clone(),
                            option_index,
                        }
                    })
                    .collect();
                questions.push(TestQuestion {
                    id: new_id(),
                    kind: kind.clone(),
                    card_id: group[0].card.id.clone(),
                    prompt: "Connect each term with its definition".into(),
                    options: rights,
                    correct_index: None,
                    correct_answer: String::new(),
                    pairs,
                    explanation: String::new(),
                });
            }
            _ => continue,
        }
    }

    Ok(questions)
}

fn format_mapping(question: &TestQuestion, mapping: &[usize]) -> String {
    mapping
        .iter()
        .enumerate()
        .map(|(index, option)| {
            let left = question
                .pairs
                .get(index)
                .map(|p| p.left.as_str())
                .unwrap_or("?");
            let right = question
                .options
                .get(*option)
                .map(|o| o.as_str())
                .unwrap_or("?");
            format!("{left} → {right}")
        })
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn grade_test(
    questions: &[TestQuestion],
    answers: &[TestAnswer],
    tolerance: i64,
    case_sensitive: bool,
) -> Vec<GradedQuestion> {
    let mut graded = Vec::new();
    for question in questions {
        let answer = answers.iter().find(|a| a.question_id == question.id);
        let mut credit = 0.0;
        let mut user_answer = String::new();
        let mut partial = false;

        match question.kind.as_str() {
            "multiple_choice" | "true_false" => {
                let chosen = answer.and_then(|a| a.option_index);
                if let Some(index) = chosen {
                    user_answer = question
                        .options
                        .get(index)
                        .cloned()
                        .unwrap_or_else(|| format!("#{index}"));
                    if Some(index) == question.correct_index {
                        credit = 1.0;
                    }
                }
                if user_answer.is_empty() {
                    user_answer = "—".into();
                }
                if question.kind == "true_false" {
                    let expected = if question.correct_index == Some(0) {
                        "True"
                    } else {
                        "False"
                    };
                    if credit > 0.0 {
                        user_answer = format!("{user_answer} ({expected})");
                    }
                }
            }
            "matching" => {
                let mapping = answer.and_then(|a| a.mapping.clone()).unwrap_or_default();
                user_answer = format_mapping(question, &mapping);
                let total_pairs = question.pairs.len().max(1);
                let hits = question
                    .pairs
                    .iter()
                    .enumerate()
                    .filter(|(index, pair)| mapping.get(*index) == Some(&pair.option_index))
                    .count();
                credit = hits as f64 / total_pairs as f64;
                partial = hits > 0 && hits < total_pairs;
                if mapping.is_empty() {
                    user_answer = "—".into();
                }
            }
            _ => {
                let text = answer.and_then(|a| a.text.clone()).unwrap_or_default();
                let check =
                    check_answer(&question.correct_answer, &text, tolerance, case_sensitive);
                credit = if check.correct {
                    1.0
                } else if check.partial {
                    0.5
                } else {
                    0.0
                };
                partial = check.partial;
                user_answer = if text.trim().is_empty() {
                    "—".into()
                } else {
                    text
                };
            }
        }

        let correct = credit >= 0.999;
        graded.push(GradedQuestion {
            question_id: question.id.clone(),
            card_id: question.card_id.clone(),
            kind: question.kind.clone(),
            prompt: question.prompt.clone(),
            user_answer,
            correct_answer: if question.kind == "matching" {
                question
                    .pairs
                    .iter()
                    .map(|p| format!("{} → {}", p.left, p.right))
                    .collect::<Vec<_>>()
                    .join("; ")
            } else {
                question.correct_answer.clone()
            },
            correct,
            partial,
            credit,
            explanation: question.explanation.clone(),
        });
    }
    graded
}

pub fn outcome_from_progress(progress: &CardProgress) -> &'static str {
    if is_due(progress, Utc::now()) {
        "due"
    } else {
        "scheduled"
    }
}

pub fn ensure_card_text(card: &StudyCard) -> AppResult<()> {
    if card.card.front.trim().is_empty() || card.card.back.trim().is_empty() {
        return Err(AppError::Validation(
            "Cards need both a front and a back side.".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalization_ignores_case_accents_and_spacing() {
        assert_eq!(normalize("  Café   au lait. "), "cafe au lait");
        assert_eq!(normalize("HELLO"), "hello");
    }

    #[test]
    fn exact_matching_respects_tolerance() {
        let strict = check_answer(" photosynthesis ", "photosynthesis", 0, false);
        assert!(strict.correct);

        let typo = check_answer("photosynthesis", "photosinthesis", 1, false);
        assert!(typo.correct, "one typo should pass with tolerance 1");

        let wrong = check_answer("mitochondria", "nucleus", 2, false);
        assert!(!wrong.correct);
    }

    #[test]
    fn slash_separated_alternatives_are_accepted() {
        let check = check_answer("colour/color", "color", 0, false);
        assert!(check.correct);
    }

    #[test]
    fn levenshtein_basics() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("", "abc"), 3);
    }

    #[test]
    fn case_sensitivity_is_configurable() {
        let insensitive = check_answer("Apple", "apple", 0, false);
        assert!(
            insensitive.correct,
            "case-insensitive mode should accept apple"
        );

        let sensitive = check_answer("Apple", "apple", 0, true);
        assert!(
            !sensitive.correct,
            "case-sensitive mode must reject lowercase apple"
        );
        assert!(!sensitive.partial);

        let sensitive_exact = check_answer("Apple", "Apple", 0, true);
        assert!(sensitive_exact.correct);

        // Whitespace trimming still applies in both modes.
        assert!(check_answer("Apple", "  Apple  ", 0, true).correct);
    }
}
