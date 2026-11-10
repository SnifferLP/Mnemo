//! Study set parsing (CSV/TSV/JSON/Quizlet) and document text extraction.

use std::io::Cursor;
use std::path::Path;

use serde_json::Value;

use crate::error::{validation, AppError, AppResult};
use crate::models::{CardInput, Flashcard, StudySet};

const MAX_TEXT_CHARS: usize = 2_000_000;

#[derive(Debug, Clone)]
pub struct ParsedSet {
    pub title: String,
    pub cards: Vec<CardInput>,
}

#[derive(Debug, Clone)]
pub struct ExtractedDoc {
    pub title: String,
    pub format: String,
    pub text: String,
}

pub fn detect_format(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_lowercase()
}

/// Parses a study set from text. Format is one of `csv`, `tsv`, `json`,
/// `quizlet` or `auto`.
pub fn parse_text(text: &str, format: &str, fallback_title: &str) -> AppResult<ParsedSet> {
    let trimmed = text.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Err(validation("The file contains no text."));
    }

    let format = format.to_lowercase();
    match format.as_str() {
        "json" => parse_json(trimmed, fallback_title),
        "csv" => parse_delimited(trimmed, b',', fallback_title),
        "tsv" | "quizlet" => parse_delimited(trimmed, b'\t', fallback_title),
        _ => {
            let first_line = trimmed.lines().next().unwrap_or("");
            if trimmed.starts_with('{') || trimmed.starts_with('[') {
                parse_json(trimmed, fallback_title)
            } else if first_line.contains('\t') {
                parse_delimited(trimmed, b'\t', fallback_title)
            } else if first_line.matches(';').count() >= 1 && !first_line.contains(',') {
                parse_delimited(trimmed, b';', fallback_title)
            } else if first_line.contains(',') {
                parse_delimited(trimmed, b',', fallback_title)
            } else {
                parse_lines(trimmed, fallback_title)
            }
        }
    }
}

fn parse_delimited(text: &str, delimiter: u8, title: &str) -> AppResult<ParsedSet> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .flexible(true)
        .from_reader(text.as_bytes());

    let mut cards = Vec::new();
    let mut skipped = 0usize;

    for record in reader.records() {
        let record = record.map_err(|e| validation(format!("Could not read the table: {e}")))?;
        let front = record.get(0).unwrap_or("").trim().to_string();
        let back = record.get(1).unwrap_or("").trim().to_string();
        if front.is_empty() && back.is_empty() {
            continue;
        }
        if is_header(&front, &back) && cards.is_empty() {
            continue;
        }
        if front.is_empty() || back.is_empty() {
            skipped += 1;
            continue;
        }
        cards.push(CardInput {
            front,
            back,
            explanation: record.get(2).unwrap_or("").trim().to_string(),
            hint: String::new(),
            card_type: None,
        });
    }

    finish(cards, skipped, title)
}

fn parse_lines(text: &str, title: &str) -> AppResult<ParsedSet> {
    let mut cards = Vec::new();
    let mut skipped = 0usize;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((front, back)) = line.split_once(" - ") {
            if !front.trim().is_empty() && !back.trim().is_empty() {
                cards.push(CardInput {
                    front: front.trim().to_string(),
                    back: back.trim().to_string(),
                    ..Default::default()
                });
                continue;
            }
        }
        if let Some((front, back)) = line.split_once(':') {
            if !front.trim().is_empty() && !back.trim().is_empty() {
                cards.push(CardInput {
                    front: front.trim().to_string(),
                    back: back.trim().to_string(),
                    ..Default::default()
                });
                continue;
            }
        }
        skipped += 1;
    }
    finish(cards, skipped, title)
}

fn is_header(front: &str, back: &str) -> bool {
    matches!(
        (front.to_lowercase().as_str(), back.to_lowercase().as_str()),
        ("term", "definition")
            | ("front", "back")
            | ("question", "answer")
            | ("word", "translation")
            | ("begriff", "definition")
            | ("frage", "antwort")
    )
}

fn parse_json(text: &str, title: &str) -> AppResult<ParsedSet> {
    let value: Value =
        serde_json::from_str(text).map_err(|e| validation(format!("Invalid JSON: {e}")))?;

    let mut cards = Vec::new();
    let mut set_title = title.to_string();

    let push_card = |cards: &mut Vec<CardInput>, front: &str, back: &str, explanation: &str| {
        if !front.trim().is_empty() && !back.trim().is_empty() {
            cards.push(CardInput {
                front: front.trim().to_string(),
                back: back.trim().to_string(),
                explanation: explanation.trim().to_string(),
                hint: String::new(),
                card_type: None,
            });
        }
    };

    match &value {
        Value::Object(map) => {
            if let Some(Value::String(t)) = map.get("title") {
                if !t.trim().is_empty() {
                    set_title = t.clone();
                }
            }
            let list = map
                .get("cards")
                .or_else(|| map.get("terms"))
                .or_else(|| map.get("flashcards"))
                .and_then(|v| v.as_array());
            if let Some(list) = list {
                for item in list {
                    let front = item
                        .get("front")
                        .or_else(|| item.get("term"))
                        .or_else(|| item.get("question"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let back = item
                        .get("back")
                        .or_else(|| item.get("definition"))
                        .or_else(|| item.get("answer"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let explanation = item
                        .get("explanation")
                        .or_else(|| item.get("notes"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    push_card(&mut cards, front, back, explanation);
                }
            }
        }
        Value::Array(list) => {
            for item in list {
                match item {
                    Value::Object(map) => {
                        let front = map
                            .get("front")
                            .or_else(|| map.get("term"))
                            .or_else(|| map.get("question"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let back = map
                            .get("back")
                            .or_else(|| map.get("definition"))
                            .or_else(|| map.get("answer"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let explanation = map
                            .get("explanation")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        push_card(&mut cards, front, back, explanation);
                    }
                    Value::Array(pair) => {
                        let front = pair.first().and_then(|v| v.as_str()).unwrap_or("");
                        let back = pair.get(1).and_then(|v| v.as_str()).unwrap_or("");
                        push_card(&mut cards, front, back, "");
                    }
                    Value::String(line) => {
                        if let Some((front, back)) = line.split_once('\t') {
                            push_card(&mut cards, front, back, "");
                        }
                    }
                    _ => {}
                }
            }
        }
        _ => return Err(validation("Unsupported JSON structure for a study set.")),
    }

    finish(cards, 0, &set_title)
}

fn finish(cards: Vec<CardInput>, skipped: usize, title: &str) -> AppResult<ParsedSet> {
    if cards.is_empty() {
        return Err(AppError::Validation(if skipped > 0 {
            "No valid term/definition pairs were found. Each line needs a term and a definition separated by a tab or comma.".into()
        } else {
            "No cards could be read from this file.".into()
        }));
    }
    Ok(ParsedSet {
        title: title.trim().to_string(),
        cards,
    })
}

/// Reads a document and extracts plain text for AI processing.
pub fn extract_document(path: &Path) -> AppResult<ExtractedDoc> {
    let meta =
        std::fs::metadata(path).map_err(|_| validation("The selected file could not be read."))?;
    if meta.len() > 60 * 1024 * 1024 {
        return Err(validation("The file is larger than 60 MB."));
    }

    let format = detect_format(&path.to_string_lossy());
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported document")
        .to_string();

    let text = match format.as_str() {
        "pdf" => {
            let bytes = std::fs::read(path)?;
            pdf_extract::extract_text_from_mem(&bytes)
                .map_err(|e| validation(format!("Could not read the PDF: {e}")))?
        }
        "docx" | "pptx" | "odt" | "epub" => {
            let bytes = std::fs::read(path)?;
            extract_office_text(&bytes, &format)?
        }
        _ => {
            let bytes = std::fs::read(path)?;
            String::from_utf8_lossy(&bytes).to_string()
        }
    };

    let text = normalise_whitespace(&text);
    if text.trim().is_empty() {
        return Err(validation(
            "No readable text was found. Scanned PDFs need OCR, which is not built in — paste the text instead.",
        ));
    }

    let text = if text.chars().count() > MAX_TEXT_CHARS {
        text.chars().take(MAX_TEXT_CHARS).collect()
    } else {
        text
    };

    Ok(ExtractedDoc {
        title,
        format,
        text,
    })
}

fn normalise_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0usize;
    for line in text.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
            out.push('\n');
        } else {
            blank_run = 0;
            out.push_str(line);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

fn extract_office_text(bytes: &[u8], format: &str) -> AppResult<String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| validation(format!("This {format} file is not a valid document: {e}")))?;

    let mut parts: Vec<(String, String)> = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| validation(format!("Could not unpack the document: {e}")))?;
        let name = file.name().to_string();
        let wanted = match format {
            "docx" => name == "word/document.xml",
            "pptx" => name.starts_with("ppt/slides/slide") && name.ends_with(".xml"),
            "odt" => name == "content.xml",
            "epub" => name.ends_with(".xhtml") || name.ends_with(".html"),
            _ => false,
        };
        if !wanted {
            continue;
        }
        let mut raw = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut raw)?;
        let xml = String::from_utf8_lossy(&raw).to_string();
        parts.push((name, strip_markup(&xml)));
    }

    if parts.is_empty() {
        return Err(validation("No text content was found in this document."));
    }

    parts.sort_by_key(|a| natural_key(&a.0));
    Ok(parts
        .into_iter()
        .map(|(_, text)| text)
        .collect::<Vec<_>>()
        .join("\n\n"))
}

/// Very small XML/HTML text extractor that keeps paragraph breaks.
fn strip_markup(xml: &str) -> String {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_reader(xml.as_bytes());
    let mut buf = Vec::new();
    let mut out = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Text(text)) => {
                let decoded = text.decode().map(|c| c.to_string()).unwrap_or_default();
                out.push_str(&decoded);
            }
            Ok(Event::End(end)) => {
                let name = end.name();
                let local = name.as_ref();
                if local == b"w:p"
                    || local == b"a:p"
                    || local == b"p"
                    || local == b"br"
                    || local == b"div"
                {
                    out.push('\n');
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    quick_xml::escape::unescape(&out)
        .map(|c| c.to_string())
        .unwrap_or(out)
}

fn natural_key(name: &str) -> (String, u32) {
    let digits: String = name.chars().filter(|c| c.is_ascii_digit()).collect();
    (name.to_string(), digits.parse::<u32>().unwrap_or_default())
}

/// Serialises a set for export. Used by the export module.
pub fn set_to_export_rows(set: &StudySet, cards: &[Flashcard]) -> Vec<Vec<String>> {
    let mut rows = vec![vec![
        "Front".to_string(),
        "Back".to_string(),
        "Explanation".to_string(),
        "Hint".to_string(),
        "Type".to_string(),
    ]];
    for card in cards {
        rows.push(vec![
            card.front.clone(),
            card.back.clone(),
            card.explanation.clone(),
            card.hint.clone(),
            card.card_type.clone(),
        ]);
    }
    let _ = set;
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tsv() {
        let parsed = parse_text("Haus\tHouse\nBaum\tTree", "tsv", "German").unwrap();
        assert_eq!(parsed.cards.len(), 2);
        assert_eq!(parsed.cards[0].front, "Haus");
        assert_eq!(parsed.cards[1].back, "Tree");
    }

    #[test]
    fn parses_csv_with_header_and_quotes() {
        let parsed =
            parse_text("Term,Definition\n\"hello, world\",greeting", "csv", "Set").unwrap();
        assert_eq!(parsed.cards.len(), 1);
        assert_eq!(parsed.cards[0].front, "hello, world");
    }

    #[test]
    fn parses_json_variants() {
        let parsed = parse_text(
            r#"[{"term":"a","definition":"1"},{"front":"b","back":"2"}]"#,
            "json",
            "Set",
        )
        .unwrap();
        assert_eq!(parsed.cards.len(), 2);

        let wrapped = parse_text(
            r#"{"title":"Deck","cards":[{"front":"x","back":"y"}]}"#,
            "json",
            "Set",
        )
        .unwrap();
        assert_eq!(wrapped.title, "Deck");
        assert_eq!(wrapped.cards.len(), 1);
    }

    #[test]
    fn skips_incomplete_lines() {
        let err = parse_text("just one column\nanother line", "tsv", "Set");
        assert!(err.is_err());
    }
}
