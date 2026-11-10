//! Prompt templates and context assembly for the AI features.

use crate::models::{CardProgress, Flashcard};

pub fn tutor_system(mode: &str, set_title: Option<&str>) -> String {
    let base = match mode {
        "socratic" => {
            "You are Mnemo, a Socratic tutor. Never state the final answer immediately. \
             Ask one focused question at a time, give a small hint if the learner is stuck, and \
             only confirm the answer once the learner has worked it out. Keep every reply under 160 words."
        }
        "simplify" => {
            "You are Mnemo, a patient tutor. Explain the topic in plain language with short sentences \
             and one concrete analogy. Offer a single follow-up question at the end. Keep replies under 200 words."
        }
        _ => {
            "You are Mnemo, a concise study tutor. Answer clearly, use short paragraphs or bullet points, \
             and finish with one question that checks understanding. Keep replies under 220 words."
        }
    };

    match set_title {
        Some(title) => format!(
            "{base}\n\nThe learner is currently studying the study set \"{title}\". Ground your answers in it when it is relevant, and say so when a question falls outside the material."
        ),
        None => base.to_string(),
    }
}

pub fn set_context(cards: &[Flashcard], limit: usize) -> String {
    let mut out = String::from("Study set contents:\n");
    for card in cards.iter().take(limit) {
        out.push_str(&format!(
            "- {} | {}\n",
            truncate(&card.front, 160),
            truncate(&card.back, 220)
        ));
    }
    out
}

pub fn gaps_context(cards: &[(Flashcard, CardProgress)], limit: usize) -> String {
    if cards.is_empty() {
        return String::new();
    }
    let mut out = String::from("Cards the learner struggles with (front | back | misses):\n");
    for (card, progress) in cards.iter().take(limit) {
        out.push_str(&format!(
            "- {} | {} | {} wrong, {} correct\n",
            truncate(&card.front, 140),
            truncate(&card.back, 180),
            progress.wrong_count,
            progress.correct_count
        ));
    }
    out
}

pub fn flashcard_system(request: &crate::models::GenerateCardsRequest) -> String {
    let difficulty = if request.difficulty.is_empty() {
        "medium"
    } else {
        &request.difficulty
    };
    let detail = if request.detail_level.is_empty() {
        "balanced"
    } else {
        &request.detail_level
    };
    let card_format = if request.card_format.is_empty() {
        "term_definition"
    } else {
        &request.card_format
    };
    let language = if request.language.is_empty() {
        "the language of the source material"
    } else {
        &request.language
    };

    format!(
        "You create high quality study flashcards from source material.\n\
         Return ONLY JSON: {{\"cards\":[{{\"front\":\"...\",\"back\":\"...\",\"explanation\":\"...\",\"hint\":\"...\"}}]}}\n\
         Rules:\n\
         - Exactly {count} cards.\n\
         - Difficulty: {difficulty}. Detail level: {detail}.\n\
         - Card style: {card_format}.\n\
         - Write the cards in {language}.\n\
         - Front holds one atomic prompt; back is a complete, self-contained answer.\n\
         - Never invent facts that are not in the source material.\n\
         - 'explanation' is optional extra context (max 240 chars); 'hint' is optional (max 90 chars).\n\
         {focus}",
        count = request.count.clamp(1, 60),
        difficulty = difficulty,
        detail = detail,
        card_format = card_format,
        language = language,
        focus = if request.focus.trim().is_empty() {
            String::new()
        } else {
            format!("- Focus especially on: {}.", request.focus.trim())
        }
    )
}

pub fn magic_notes_system(request: &crate::models::MagicNotesRequest) -> String {
    let language = if request.language.is_empty() {
        "the language of the notes"
    } else {
        &request.language
    };
    format!(
        "You turn study notes into structured learning material.\n\
         Return ONLY JSON with this exact shape:\n\
         {{\"summary\":\"...\",\"keyPoints\":[\"...\"],\"definitions\":[{{\"term\":\"...\",\"definition\":\"...\"}}],\
         \"cards\":[{{\"front\":\"...\",\"back\":\"...\"}}],\"quiz\":[{{\"question\":\"...\",\"options\":[\"...\"],\"answer\":\"...\",\"explanation\":\"...\"}}],\
         \"studyGuide\":\"...\"}}\n\
         Rules: {count} flashcards, 5 quiz questions with 4 options each, 6-10 key points, a study guide of 3-6 short paragraphs in Markdown. Write everything in {language}. Base every item strictly on the notes."
    ,
        count = request.card_count.clamp(3, 40),
        language = language
    )
}

pub fn grade_system() -> String {
    "You grade short free-text study answers. Return ONLY JSON: \
     {\"verdict\":\"correct|partial|incorrect\",\"feedback\":\"one short sentence\"}. \
     Accept answers that are semantically equivalent, ignore typos and articles. \
     Use 'partial' only when the answer is incomplete but on the right track."
        .to_string()
}

pub fn truncate(text: &str, max: usize) -> String {
    let cleaned = text.replace('\n', " ");
    if cleaned.chars().count() <= max {
        cleaned
    } else {
        let mut out: String = cleaned.chars().take(max).collect();
        out.push('…');
        out
    }
}
