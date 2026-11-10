//! Exporters: CSV, TSV, JSON, Markdown and a small dependency-free PDF writer.

use std::fmt::Write as _;

use serde::Serialize;

use crate::models::{Flashcard, StudySet};

pub fn to_csv(set: &StudySet, cards: &[Flashcard]) -> String {
    let rows = rows(cards);
    let mut writer = csv::WriterBuilder::new().from_writer(Vec::new());
    for row in rows {
        let _ = writer.write_record(row);
    }
    let bytes = writer.into_inner().unwrap_or_default();
    let _ = set;
    String::from_utf8_lossy(&bytes).to_string()
}

pub fn to_tsv(set: &StudySet, cards: &[Flashcard]) -> String {
    let mut out = String::new();
    // Quizlet-compatible: tab separated, no header.
    let _ = set;
    for card in cards {
        let _ = writeln!(
            out,
            "{}\t{}",
            single_line(&card.front),
            single_line(&card.back)
        );
    }
    out
}

fn rows(cards: &[Flashcard]) -> Vec<Vec<String>> {
    let mut rows = vec![vec![
        "Front".to_string(),
        "Back".to_string(),
        "Explanation".to_string(),
    ]];
    for card in cards {
        rows.push(vec![
            card.front.clone(),
            card.back.clone(),
            card.explanation.clone(),
        ]);
    }
    rows
}

fn single_line(value: &str) -> String {
    value.replace(['\n', '\r'], " ").trim().to_string()
}

pub fn to_json(set: &StudySet, cards: &[Flashcard], tags: &[String]) -> String {
    #[derive(Serialize)]
    struct CardOut<'a> {
        front: &'a str,
        back: &'a str,
        explanation: &'a str,
        hint: &'a str,
        #[serde(rename = "type")]
        card_type: &'a str,
    }

    #[derive(Serialize)]
    struct SetOut<'a> {
        format: &'a str,
        title: &'a str,
        description: &'a str,
        language_front: &'a str,
        language_back: &'a str,
        tags: &'a [String],
        cards: Vec<CardOut<'a>>,
    }

    let payload = SetOut {
        format: "mnemo-set-v1",
        title: &set.title,
        description: &set.description,
        language_front: &set.language_front,
        language_back: &set.language_back,
        tags,
        cards: cards
            .iter()
            .map(|c| CardOut {
                front: &c.front,
                back: &c.back,
                explanation: &c.explanation,
                hint: &c.hint,
                card_type: &c.card_type,
            })
            .collect(),
    };

    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into())
}

pub fn to_markdown(set: &StudySet, cards: &[Flashcard], tags: &[String]) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "# {}\n", set.title);
    if !set.description.trim().is_empty() {
        let _ = writeln!(out, "{}\n", set.description.trim());
    }
    let mut meta = vec![format!("**{} cards**", cards.len())];
    if !set.language_front.is_empty() && !set.language_back.is_empty() {
        meta.push(format!("{} → {}", set.language_front, set.language_back));
    }
    if !tags.is_empty() {
        meta.push(
            tags.iter()
                .map(|t| format!("#{t}"))
                .collect::<Vec<_>>()
                .join(" "),
        );
    }
    let _ = writeln!(out, "{}\n", meta.join(" · "));
    let _ = writeln!(out, "---\n");

    for (index, card) in cards.iter().enumerate() {
        let _ = writeln!(out, "### {}. {}\n", index + 1, card.front.trim());
        let _ = writeln!(out, "{}\n", card.back.trim());
        if !card.explanation.trim().is_empty() {
            let _ = writeln!(out, "> {}\n", card.explanation.trim().replace('\n', "\n> "));
        }
        if !card.hint.trim().is_empty() {
            let _ = writeln!(out, "*Hint: {}*\n", card.hint.trim());
        }
    }

    let _ = writeln!(out, "---\n\n*Exported from Mnemo*");
    out
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

struct Line {
    text: String,
    bold: bool,
    size: f32,
    gap_before: f32,
}

/// A minimal, dependency free PDF generator (A4, Helvetica, WinAnsi encoding).
///
/// Latin scripts are fully supported. Characters outside WinAnsi are
/// transliterated where possible and replaced otherwise, so exports never fail
/// because of an exotic glyph. Markdown/Markdown-print export keeps full Unicode.
pub fn to_pdf(set: &StudySet, cards: &[Flashcard]) -> Vec<u8> {
    let page_width = 595.0f32;
    let page_height = 842.0f32;
    let margin = 52.0f32;

    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line {
        text: set.title.clone(),
        bold: true,
        size: 21.0,
        gap_before: 0.0,
    });
    if !set.description.trim().is_empty() {
        for piece in wrap(&set.description, 78) {
            lines.push(Line {
                text: piece,
                bold: false,
                size: 10.5,
                gap_before: 4.0,
            });
        }
    }
    lines.push(Line {
        text: format!("Mnemo · {} cards · {} worksheets", cards.len(), cards.len()),
        bold: false,
        size: 9.5,
        gap_before: 8.0,
    });

    for (index, card) in cards.iter().enumerate() {
        for piece in wrap(&format!("{}. {}", index + 1, card.front.trim()), 74) {
            lines.push(Line {
                text: piece,
                bold: true,
                size: 13.0,
                gap_before: 18.0,
            });
        }
        for piece in wrap(card.back.trim(), 82) {
            lines.push(Line {
                text: piece,
                bold: false,
                size: 11.0,
                gap_before: 5.0,
            });
        }
        if !card.explanation.trim().is_empty() {
            for piece in wrap(&format!("Note: {}", card.explanation.trim()), 84) {
                lines.push(Line {
                    text: piece,
                    bold: false,
                    size: 9.5,
                    gap_before: 4.0,
                });
            }
        }
    }

    // Paginate.
    let mut pages: Vec<Vec<Line>> = Vec::new();
    let mut current: Vec<Line> = Vec::new();
    let mut y = page_height - margin - 10.0;
    for mut line in lines {
        let consumed = if current.is_empty() {
            0.0
        } else {
            line.gap_before + line.size * 1.32
        };
        if y - consumed < margin + 24.0 {
            pages.push(std::mem::take(&mut current));
            y = page_height - margin - 10.0;
            line.gap_before = 0.0;
        }
        y -= if current.is_empty() {
            line.size * 1.32
        } else {
            consumed
        };
        current.push(line);
    }
    if !current.is_empty() {
        pages.push(current);
    }
    if pages.is_empty() {
        pages.push(vec![]);
    }

    let page_count = pages.len();
    let first_page_ref = 3usize;
    let font_regular_ref = first_page_ref + page_count;
    let font_bold_ref = font_regular_ref + 1;
    let content_start = font_bold_ref + 1;

    let mut objects: Vec<Vec<u8>> = Vec::new();

    // 1: catalog
    objects.push(b"<< /Type /Catalog /Pages 2 0 R >>".to_vec());

    // 2: pages
    let kids = (0..page_count)
        .map(|i| format!("{} 0 R", first_page_ref + i))
        .collect::<Vec<_>>()
        .join(" ");
    objects.push(format!("<< /Type /Pages /Kids [{kids}] /Count {page_count} >>").into_bytes());

    // pages
    for index in 0..page_count {
        objects.push(
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] \
                 /Resources << /Font << /F1 {font_regular_ref} 0 R /F2 {font_bold_ref} 0 R >> >> \
                 /Contents {} 0 R >>",
                content_start + index
            )
            .into_bytes(),
        );
    }

    // fonts
    objects.push(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    );
    objects.push(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    );

    // content streams
    for (page_index, page) in pages.iter().enumerate() {
        let mut content = String::new();
        let mut cursor_y = page_height - margin - 6.0;
        for line in page {
            cursor_y -= line.gap_before + line.size * 1.32;
            let font = if line.bold { "/F2" } else { "/F1" };
            let _ = writeln!(
                content,
                "BT {font} {:.1} Tf 1 0 0 1 {:.1} {:.1} Tm ({}) Tj ET",
                line.size,
                margin,
                cursor_y,
                escape_pdf(&line.text)
            );
        }
        let _ = writeln!(
            content,
            "BT /F1 8.5 Tf 1 0 0 1 {:.1} 26 Tm (Mnemo - page {} of {}) Tj ET",
            margin,
            page_index + 1,
            page_count
        );
        let stream = content.into_bytes();
        let mut body = format!("<< /Length {} >>\nstream\n", stream.len()).into_bytes();
        body.extend_from_slice(&stream);
        body.extend_from_slice(b"\nendstream");
        objects.push(body);
    }

    // Serialise with a cross-reference table.
    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    let mut offsets: Vec<usize> = Vec::new();
    for (index, body) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        out.extend_from_slice(body);
        out.extend_from_slice(b"\nendobj\n");
    }

    let xref_pos = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    out.extend_from_slice(b"0000000000 65535 f \n");
    for offset in &offsets {
        out.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R /Producer (Mnemo) >>\nstartxref\n{xref_pos}\n%%EOF",
            objects.len() + 1
        )
        .as_bytes(),
    );
    out
}

fn wrap(text: &str, max_chars: usize) -> Vec<String> {
    let mut out = Vec::new();
    for raw_line in text.split('\n') {
        let mut current = String::new();
        for word in raw_line.split_whitespace() {
            let word_len = word.chars().count();
            if !current.is_empty() && current.chars().count() + word_len + 1 > max_chars {
                out.push(std::mem::take(&mut current));
            }
            if !current.is_empty() {
                current.push(' ');
            }
            if word_len > max_chars {
                // Very long token: hard split.
                for chunk in word.chars().collect::<Vec<_>>().chunks(max_chars) {
                    current.extend(chunk.iter());
                }
            } else {
                current.push_str(word);
            }
        }
        out.push(current);
    }
    out
}

fn escape_pdf(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 8);
    for ch in text.chars() {
        match ch {
            '(' => out.push_str("\\("),
            ')' => out.push_str("\\)"),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push(' '),
            '\r' => {}
            _ => {
                let code = ch as u32;
                if (32..=126).contains(&code) || (160..=255).contains(&code) {
                    out.push(ch);
                } else if code <= 126 {
                    out.push(' ');
                } else {
                    out.push_str(&transliterate(ch));
                }
            }
        }
    }
    out
}

fn transliterate(ch: char) -> String {
    use unicode_normalization::UnicodeNormalization;
    let folded: String = ch.to_string().nfkd().filter(|c| c.is_ascii()).collect();
    if folded.is_empty() {
        "?".into()
    } else {
        folded
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> (StudySet, Vec<Flashcard>) {
        let set = StudySet {
            id: "s1".into(),
            title: "Biology".into(),
            description: "Cell basics".into(),
            folder_id: None,
            language_front: "English".into(),
            language_back: "English".into(),
            is_favorite: false,
            source: "manual".into(),
            created_at: "2024-01-01T00:00:00.000Z".into(),
            updated_at: "2024-01-01T00:00:00.000Z".into(),
            last_studied_at: None,
        };
        let card = Flashcard {
            id: "c1".into(),
            set_id: "s1".into(),
            position: 0,
            front: "Mitochondria".into(),
            back: "Powerhouse of the cell".into(),
            explanation: "Produces ATP".into(),
            hint: String::new(),
            card_type: "term_definition".into(),
            image_path: None,
            audio_path: None,
            created_at: "2024-01-01T00:00:00.000Z".into(),
            updated_at: "2024-01-01T00:00:00.000Z".into(),
        };
        (set, vec![card])
    }

    #[test]
    fn json_round_trips() {
        let (set, cards) = sample();
        let json = to_json(&set, &cards, &["bio".into()]);
        let parsed = crate::import::parse_text(&json, "json", "x").unwrap();
        assert_eq!(parsed.cards.len(), 1);
        assert_eq!(parsed.cards[0].back, "Powerhouse of the cell");
    }

    #[test]
    fn csv_has_header_and_quotes() {
        let (set, mut cards) = sample();
        cards[0].back = "Power, \"house\", of the cell".into();
        let csv = to_csv(&set, &cards);
        assert!(csv.starts_with("Front,Back"));
        let parsed = crate::import::parse_text(&csv, "csv", "x").unwrap();
        assert_eq!(parsed.cards[0].back, "Power, \"house\", of the cell");
    }

    #[test]
    fn pdf_is_well_formed() {
        let (set, cards) = sample();
        let pdf = to_pdf(&set, &cards);
        assert!(pdf.starts_with(b"%PDF-1.4"));
        assert!(pdf.ends_with(b"%%EOF"));
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.contains("Mitochondria"));
    }

    #[test]
    fn markdown_contains_title_and_cards() {
        let (set, cards) = sample();
        let md = to_markdown(&set, &cards, &[]);
        assert!(md.contains("# Biology"));
        assert!(md.contains("Powerhouse of the cell"));
    }
}
