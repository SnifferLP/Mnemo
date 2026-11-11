//! End-to-end backend tests: real SQLite database in a temp directory,
//! migrations, services, SM-2 persistence and import/export round trips.

use std::path::{Path, PathBuf};

use chrono::{Duration, Local};
use mnemo_lib::db;
use mnemo_lib::export;
use mnemo_lib::import;
use mnemo_lib::learning::{self, TestAnswer, TestConfig};
use mnemo_lib::models::{CardInput, CreateSetInput, UpdateSetInput};
use mnemo_lib::services::{documents, sessions, sets};
use mnemo_lib::settings::{self, AppSettings};
use mnemo_lib::spaced_repetition::Outcome;
use mnemo_lib::statistics;
use sqlx::SqlitePool;
use uuid::Uuid;

struct TestDb {
    dir: PathBuf,
    pool: SqlitePool,
}

impl TestDb {
    async fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("mnemo-it-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let pool = db::init(&dir.join("mnemo.db"))
            .await
            .expect("database init");
        Self { dir, pool }
    }

    fn path(&self) -> PathBuf {
        self.dir.join("mnemo.db")
    }

    async fn reopen(&mut self) {
        self.pool.close().await;
        self.pool = db::init(&self.path()).await.expect("database reopen");
    }

    async fn cleanup(self) {
        self.pool.close().await;
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

fn card(front: &str, back: &str) -> CardInput {
    CardInput {
        front: front.into(),
        back: back.into(),
        explanation: String::new(),
        hint: String::new(),
        card_type: None,
    }
}

fn set_input(title: &str, cards: Vec<CardInput>) -> CreateSetInput {
    CreateSetInput {
        title: title.into(),
        description: "Integration test set".into(),
        folder_id: None,
        language_front: None,
        language_back: None,
        source: None,
        tags: vec![],
        cards,
    }
}

fn flashcards(detail: &mnemo_lib::models::StudySetDetail) -> Vec<mnemo_lib::models::Flashcard> {
    detail.cards.iter().map(|c| c.card.clone()).collect()
}

#[tokio::test]
async fn crud_reviews_statistics_and_restart() {
    let mut db = TestDb::new().await;

    let created = sets::create(
        &db.pool,
        set_input(
            "Cell Biology",
            vec![
                card("Mitochondria", "Powerhouse of the cell"),
                card("Nucleus", "Stores genetic material"),
                card("Ribosome", "Builds proteins"),
            ],
        ),
    )
    .await
    .expect("create set");

    assert_eq!(created.set.title, "Cell Biology");
    assert_eq!(created.cards.len(), 3);

    // Search hits card content, not just titles.
    let found = sets::list_summaries(
        &db.pool,
        Some("powerhouse".into()),
        None,
        None,
        false,
        false,
        "recent",
    )
    .await
    .expect("search");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].card_count, 3);
    assert_eq!(found[0].mastered_count, 0);

    // Update metadata.
    let updated = sets::update(
        &db.pool,
        &created.set.id,
        UpdateSetInput {
            title: "Cell Biology 101".into(),
            description: "Organelles".into(),
            folder_id: None,
            language_front: Some("English".into()),
            language_back: Some("English".into()),
        },
    )
    .await
    .expect("update");
    assert_eq!(updated.set.title, "Cell Biology 101");

    // Duplicate copies cards but not review history.
    let copy = sets::duplicate(&db.pool, &created.set.id)
        .await
        .expect("duplicate");
    assert_eq!(copy.cards.len(), 3);
    assert_eq!(copy.set.title, "Cell Biology 101 (copy)");

    // Five correct reviews reach the 21-day mastery threshold.
    let card_id = created.cards[0].card.id.clone();
    let mut progress = None;
    for _ in 0..5 {
        progress = Some(
            sessions::record_review(&db.pool, &card_id, Outcome::Correct, "flashcards", 1_500)
                .await
                .expect("review"),
        );
    }
    let progress = progress.expect("progress");
    assert_eq!(progress.correct_count, 5);
    assert_eq!(progress.state, "review");
    assert!(progress.interval_days >= 21.0);

    let detail = sets::get(&db.pool, &created.set.id).await.expect("get");
    assert_eq!(detail.title, "Cell Biology 101");
    let with_progress = sets::detail(&db.pool, &created.set.id)
        .await
        .expect("detail");
    assert_eq!(with_progress.mastered_count, 1);

    // A wrong answer resets the card into relearning.
    let lapsed = sessions::record_review(&db.pool, &card_id, Outcome::Incorrect, "write", 900)
        .await
        .expect("lapse");
    assert_eq!(lapsed.state, "relearning");
    assert_eq!(lapsed.lapses, 1);
    assert!(lapsed.interval_days < 1.0);

    // Sessions power study-time statistics.
    let session_id = sessions::start(&db.pool, Some(created.set.id.clone()), "flashcards")
        .await
        .expect("start session");
    let finished = sessions::finish(&db.pool, &session_id, 6, 4, 2, 300)
        .await
        .expect("finish session");
    assert_eq!(finished.cards_studied, 6);
    assert_eq!(finished.duration_seconds, 300);

    let stats = statistics::statistics(&db.pool, 30, 30)
        .await
        .expect("statistics");
    // The duplicate above is a second set with three cards of its own.
    assert_eq!(stats.totals.cards, 6);
    assert_eq!(stats.totals.sets, 2);
    assert_eq!(stats.totals.reviews_7d, 6);
    assert!(stats.totals.study_minutes_7d >= 5.0);
    assert_eq!(stats.sets.len(), 2);
    assert_eq!(stats.sets[0].reviews, 6);

    let dashboard = statistics::dashboard(&db.pool, 30)
        .await
        .expect("dashboard");
    assert_eq!(dashboard.totals.sets, 2);
    assert_eq!(dashboard.activity.len(), 14);

    let set_stats = statistics::set_statistics(&db.pool, &created.set.id)
        .await
        .expect("set statistics");
    assert_eq!(set_stats.reviews, 6);
    assert_eq!(set_stats.cards_detail.len(), 3);

    // Progress must survive a full close/reopen cycle.
    db.reopen().await;
    let after_restart = sets::detail(&db.pool, &created.set.id)
        .await
        .expect("detail after restart");
    let persisted = after_restart
        .cards
        .iter()
        .find(|c| c.card.id == card_id)
        .expect("card");
    assert_eq!(persisted.progress.correct_count, 5);
    assert_eq!(persisted.progress.wrong_count, 1);
    assert_eq!(persisted.progress.lapses, 1);

    // Deleting the set cascades to cards and progress.
    sets::delete(&db.pool, &created.set.id)
        .await
        .expect("delete");
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM flashcards WHERE set_id = ?")
        .bind(&created.set.id)
        .fetch_one(&db.pool)
        .await
        .expect("count");
    assert_eq!(remaining, 0);

    db.cleanup().await;
}

#[tokio::test]
async fn import_export_round_trip() {
    let db = TestDb::new().await;

    let parsed = import::parse_text(
        "Haus\tHouse\nBaum\tTree\nFluss\tRiver",
        "tsv",
        "German basics",
    )
    .expect("parse tsv");
    assert_eq!(parsed.cards.len(), 3);

    let created = sets::create(&db.pool, set_input("German basics", parsed.cards))
        .await
        .expect("create");

    let cards = flashcards(&created);

    let json = export::to_json(&created.set, &cards, &["language".into()]);
    let reparsed = import::parse_text(&json, "json", "x").expect("reparse json");
    assert_eq!(reparsed.title, "German basics");
    assert_eq!(reparsed.cards.len(), 3);
    assert_eq!(reparsed.cards[1].back, "Tree");

    let csv = export::to_csv(&created.set, &cards);
    assert!(csv.starts_with("Front,Back"));
    let from_csv = import::parse_text(&csv, "csv", "x").expect("reparse csv");
    assert_eq!(from_csv.cards.len(), 3);

    let tsv = export::to_tsv(&created.set, &cards);
    let from_tsv = import::parse_text(&tsv, "tsv", "x").expect("reparse tsv");
    assert_eq!(from_tsv.cards.len(), 3);

    let markdown = export::to_markdown(&created.set, &cards, &[]);
    assert!(markdown.contains("# German basics"));
    assert!(markdown.contains("River"));

    let pdf = export::to_pdf(&created.set, &cards);
    assert!(pdf.starts_with(b"%PDF-1.4"));
    assert!(pdf.ends_with(b"%%EOF"));

    // CSV header is not mistaken for a card.
    let with_header = import::parse_text("Term,Definition\nA,B", "csv", "Set").expect("header");
    assert_eq!(with_header.cards.len(), 1);
    assert_eq!(with_header.cards[0].front, "A");

    // A malformed import must fail loudly instead of creating an empty set.
    assert!(import::parse_text("just one column", "tsv", "Set").is_err());

    db.cleanup().await;
}

#[tokio::test]
async fn settings_are_sanitised_and_persisted() {
    let db = TestDb::new().await;

    let defaults = settings::load(&db.pool).await.expect("defaults");
    assert_eq!(defaults.theme, "system");
    assert_eq!(defaults.accent, "ember");
    assert_eq!(defaults.display_font, "editorial");
    assert_eq!(defaults.language, "en");
    assert_eq!(defaults.update_channel, "stable");
    assert_eq!(defaults.daily_goal, 30);

    let custom = AppSettings {
        theme: "neon".into(),
        daily_goal: 9_999,
        daily_goal_minutes: 0,
        new_cards_per_session: 1,
        answer_tolerance: 9,
        ai_card_batch: 500,
        display_name: "A".repeat(200),
        accent: "teal".into(),
        animations: false,
        display_font: "modern".into(),
        language: "de".into(),
        ..Default::default()
    };

    let saved = settings::save(&db.pool, &custom).await.expect("save");
    assert_eq!(saved.theme, "dark");
    assert_eq!(saved.daily_goal, 1_000);
    assert_eq!(saved.daily_goal_minutes, 1);
    assert_eq!(saved.new_cards_per_session, 3);
    assert_eq!(saved.answer_tolerance, 2);
    assert_eq!(saved.ai_card_batch, 60);
    assert_eq!(saved.display_name.chars().count(), 60);
    assert_eq!(saved.accent, "teal");
    assert!(!saved.animations);
    assert_eq!(saved.display_font, "modern");
    assert_eq!(saved.language, "de");

    let loaded = settings::load(&db.pool).await.expect("reload");
    assert_eq!(loaded.accent, "teal");
    assert_eq!(loaded.daily_goal, 1_000);
    assert!(!loaded.animations);
    assert_eq!(loaded.display_font, "modern");
    assert_eq!(loaded.language, "de");

    let mut invalid = loaded;
    invalid.display_font = "comic".into();
    invalid.language = "fr".into();
    invalid.update_channel = "nightly".into();
    let sanitised = settings::save(&db.pool, &invalid).await.expect("sanitise");
    assert_eq!(sanitised.display_font, "editorial");
    assert_eq!(sanitised.language, "en");
    assert_eq!(sanitised.update_channel, "stable");

    db.cleanup().await;
}

#[tokio::test]
async fn test_generation_and_grading() {
    let db = TestDb::new().await;

    let created = sets::create(
        &db.pool,
        set_input(
            "World Capitals",
            vec![
                card("France", "Paris"),
                card("Japan", "Tokyo"),
                card("Brazil", "Brasilia"),
                card("Canada", "Ottawa"),
                card("Kenya", "Nairobi"),
            ],
        ),
    )
    .await
    .expect("create");

    let cards = created.cards.clone();
    let questions = learning::generate_test(
        &cards,
        &TestConfig {
            question_types: vec![],
            count: 10,
            time_limit_seconds: Some(300),
        },
    )
    .expect("generate");
    assert_eq!(questions.len(), 10);
    for question in &questions {
        assert!(!question.prompt.trim().is_empty());
        match question.kind.as_str() {
            "multiple_choice" => assert!(question.options.len() >= 2),
            "true_false" => assert_eq!(question.options.len(), 2),
            "matching" => assert!(question.pairs.len() >= 2),
            _ => assert!(!question.correct_answer.is_empty()),
        }
    }

    // Answer every question perfectly using the exposed answer key.
    let answers: Vec<TestAnswer> = questions
        .iter()
        .map(|question| TestAnswer {
            question_id: question.id.clone(),
            text: match question.kind.as_str() {
                "multiple_choice" | "true_false" | "matching" => None,
                _ => Some(question.correct_answer.clone()),
            },
            option_index: match question.kind.as_str() {
                "multiple_choice" | "true_false" => question.correct_index,
                _ => None,
            },
            mapping: if question.kind == "matching" {
                Some(question.pairs.iter().map(|p| p.option_index).collect())
            } else {
                None
            },
        })
        .collect();

    let graded = learning::grade_test(&questions, &answers, 1, false);
    assert_eq!(graded.len(), 10);
    assert!(
        graded.iter().all(|q| q.correct && q.credit >= 0.999),
        "expected a perfect score, got {:?}",
        graded
            .iter()
            .map(|q| (&q.kind, q.credit))
            .collect::<Vec<_>>()
    );

    // Unanswered questions score zero rather than panicking.
    let blank = learning::grade_test(&questions, &[], 0, false);
    assert!(blank.iter().all(|q| q.credit == 0.0 && !q.correct));

    // Sets without cards cannot produce a test.
    let empty = sets::create(&db.pool, set_input("Empty", vec![]))
        .await
        .expect("empty set");
    let failure = learning::generate_test(
        &empty.cards,
        &TestConfig {
            question_types: vec![],
            count: 5,
            time_limit_seconds: None,
        },
    );
    assert!(failure.is_err());

    db.cleanup().await;
}

#[tokio::test]
async fn empty_database_reports_no_activity() {
    let db = TestDb::new().await;

    let stats = statistics::statistics(&db.pool, 30, 30)
        .await
        .expect("statistics");
    assert_eq!(stats.totals.sets, 0);
    assert_eq!(stats.totals.cards, 0);
    assert_eq!(stats.totals.mastered, 0);
    assert_eq!(stats.totals.due_today, 0);
    assert_eq!(stats.totals.reviews_today, 0);
    assert_eq!(stats.totals.reviews_7d, 0);
    assert_eq!(stats.totals.correct_today, 0);
    assert_eq!(stats.totals.minutes_today, 0.0);
    assert_eq!(stats.totals.streak_days, 0);
    assert_eq!(stats.totals.accuracy_7d, 0.0);
    assert_eq!(stats.totals.goal_progress, 0.0);
    assert!(stats.sets.is_empty());
    assert!(stats.modes.is_empty());
    assert!(stats.daily.iter().all(|day| day.reviews == 0));

    let dashboard = statistics::dashboard(&db.pool, 30)
        .await
        .expect("dashboard");
    assert_eq!(dashboard.totals.sets, 0);
    assert_eq!(dashboard.totals.cards, 0);
    assert!(dashboard.recent_sets.is_empty());
    assert!(dashboard.continue_sets.is_empty());
    assert!(dashboard.reviews_due.is_empty());
    assert!(dashboard.recent_sessions.is_empty());
    assert!(dashboard.recent_tests.is_empty());
    assert_eq!(dashboard.activity.len(), 14);
    assert!(dashboard.activity.iter().all(|day| day.reviews == 0));

    // An untouched database contains no reviews and no sessions at all.
    let reviews: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_reviews")
        .fetch_one(&db.pool)
        .await
        .expect("review count");
    let sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM study_sessions")
        .fetch_one(&db.pool)
        .await
        .expect("session count");
    assert_eq!(reviews, 0);
    assert_eq!(sessions, 0);

    db.cleanup().await;
}

#[tokio::test]
async fn deleting_a_set_removes_its_review_history() {
    let db = TestDb::new().await;

    let created = sets::create(
        &db.pool,
        set_input(
            "Temporary set",
            vec![card("A", "1"), card("B", "2"), card("C", "3")],
        ),
    )
    .await
    .expect("create");

    sessions::record_review(
        &db.pool,
        &created.cards[0].card.id,
        Outcome::Correct,
        "write",
        100,
    )
    .await
    .expect("review a");
    sessions::record_review(
        &db.pool,
        &created.cards[1].card.id,
        Outcome::Incorrect,
        "write",
        100,
    )
    .await
    .expect("review b");

    let before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_reviews WHERE set_id = ?")
        .bind(&created.set.id)
        .fetch_one(&db.pool)
        .await
        .expect("review count");
    assert_eq!(before, 2);

    sets::delete(&db.pool, &created.set.id)
        .await
        .expect("delete set");

    let after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_reviews WHERE set_id = ?")
        .bind(&created.set.id)
        .fetch_one(&db.pool)
        .await
        .expect("review count after delete");
    assert_eq!(after, 0, "deleting a set must remove its reviews");

    // The library is genuinely empty again, with no ghost statistics.
    let stats = statistics::statistics(&db.pool, 30, 30)
        .await
        .expect("statistics");
    assert_eq!(stats.totals.sets, 0);
    assert_eq!(stats.totals.cards, 0);
    assert_eq!(stats.totals.reviews_7d, 0);
    assert_eq!(stats.totals.study_minutes_7d, 0.0);

    db.cleanup().await;
}

#[tokio::test]
async fn theme_and_accent_persist_independently() {
    let mut db = TestDb::new().await;

    let light = AppSettings {
        theme: "light".into(),
        accent: "rose".into(),
        ..Default::default()
    };
    settings::save(&db.pool, &light).await.expect("save light");

    let loaded = settings::load(&db.pool).await.expect("load light");
    assert_eq!(loaded.theme, "light");
    assert_eq!(loaded.accent, "rose");

    // Changing only the accent keeps light mode.
    let mut accent_only = loaded.clone();
    accent_only.accent = "teal".into();
    let saved = settings::save(&db.pool, &accent_only)
        .await
        .expect("save accent");
    assert_eq!(saved.theme, "light");
    assert_eq!(saved.accent, "teal");

    // Changing only the theme keeps the accent.
    let mut dark = saved.clone();
    dark.theme = "dark".into();
    let dark_saved = settings::save(&db.pool, &dark).await.expect("save dark");
    assert_eq!(dark_saved.theme, "dark");
    assert_eq!(dark_saved.accent, "teal");

    db.reopen().await;
    let reloaded = settings::load(&db.pool).await.expect("reload");
    assert_eq!(reloaded.theme, "dark");
    assert_eq!(reloaded.accent, "teal");

    db.cleanup().await;
}

#[tokio::test]
async fn upgrading_a_v100_database_drops_orphaned_reviews() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    let dir = std::env::temp_dir().join(format!("mnemo-upgrade-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let db_path = dir.join("mnemo.db");

    // Apply only the original migration, exactly like a v1.0.0 install.
    let old_dir = dir.join("migrations");
    std::fs::create_dir_all(&old_dir).expect("migration dir");
    let original = std::fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations/0001_init.sql"),
    )
    .expect("read v1 schema");
    std::fs::write(old_dir.join("0001_init.sql"), original).expect("stage v1 schema");

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&db_path)
                .create_if_missing(true)
                .foreign_keys(true),
        )
        .await
        .expect("open v1 database");
    sqlx::migrate::Migrator::new(old_dir.as_path())
        .await
        .expect("v1 migrator")
        .run(&pool)
        .await
        .expect("apply v1 schema");

    let now = "2026-01-01T00:00:00.000Z";
    sqlx::query(
        "INSERT INTO study_sets (id, title, created_at, updated_at)
         VALUES ('s1', 'Old set', ?, ?)",
    )
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .expect("set");
    for (id, front) in [("c1", "A"), ("c2", "B")] {
        sqlx::query(
            "INSERT INTO flashcards (id, set_id, front, back, created_at, updated_at)
             VALUES (?, 's1', ?, 'answer', ?, ?)",
        )
        .bind(id)
        .bind(front)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .expect("card");
    }

    // v1.0.0 allowed reviews to outlive their card (no foreign keys did this
    // automatically, and deleting a set left them behind).
    sqlx::query(
        "INSERT INTO card_reviews (card_id, set_id, mode, rating, outcome, duration_ms, created_at)
         VALUES ('deleted-card', 's1', 'write', 1, 'correct', 100, ?)",
    )
    .bind(now)
    .execute(&pool)
    .await
    .expect("orphan review");
    sqlx::query(
        "INSERT INTO card_reviews (card_id, set_id, mode, rating, outcome, duration_ms, created_at)
         VALUES ('c1', 's1', 'write', 1, 'correct', 100, ?)",
    )
    .bind(now)
    .execute(&pool)
    .await
    .expect("valid review");
    pool.close().await;

    // v1.0.1 startup applies 0002 on top of the existing database.
    let upgraded = db::init(&db_path).await.expect("upgrade database");
    let reviews: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_reviews")
        .fetch_one(&upgraded)
        .await
        .expect("review count");
    assert_eq!(reviews, 1, "only the review with a live card survives");

    let foreign_keys: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM pragma_foreign_key_list('card_reviews')")
            .fetch_one(&upgraded)
            .await
            .expect("foreign keys");
    assert_eq!(foreign_keys, 2);

    // Deleting the set now cascades to its reviews.
    sqlx::query("DELETE FROM study_sets WHERE id = 's1'")
        .execute(&upgraded)
        .await
        .expect("delete set");
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_reviews")
        .fetch_one(&upgraded)
        .await
        .expect("review count after cascade");
    assert_eq!(remaining, 0);

    upgraded.close().await;
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn database_file_is_created_in_temp_dir() {
    // Guards against accidentally running against the real app data directory.
    let dir = std::env::temp_dir();
    assert!(Path::new(&dir).exists());
}

#[tokio::test]
async fn upgrading_a_v121_database_preserves_data_and_adds_archive() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    let dir = std::env::temp_dir().join(format!("mnemo-v121-upgrade-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let db_path = dir.join("mnemo.db");
    let old_dir = dir.join("migrations");
    std::fs::create_dir_all(&old_dir).expect("migration dir");
    for name in ["0001_init.sql", "0002_review_foreign_keys.sql"] {
        let source = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("migrations")
                .join(name),
        )
        .expect("read v1.2.1 schema");
        std::fs::write(old_dir.join(name), source).expect("stage v1.2.1 schema");
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&db_path)
                .create_if_missing(true)
                .foreign_keys(true),
        )
        .await
        .expect("open v1.2.1 database");
    sqlx::migrate::Migrator::new(old_dir.as_path())
        .await
        .expect("v1.2.1 migrator")
        .run(&pool)
        .await
        .expect("apply v1.2.1 schema");

    let now = "2026-01-01T12:00:00.000Z";
    sqlx::query(
        "INSERT INTO study_sets (id, title, created_at, updated_at)
         VALUES ('s1', 'Existing set', ?, ?)",
    )
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .expect("set");
    sqlx::query(
        "INSERT INTO flashcards (id, set_id, front, back, created_at, updated_at)
         VALUES ('c1', 's1', 'A', '1', ?, ?)",
    )
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .expect("card");
    sqlx::query("INSERT INTO card_progress (card_id, set_id) VALUES ('c1', 's1')")
        .execute(&pool)
        .await
        .expect("progress");
    sqlx::query(
        "INSERT INTO card_reviews (card_id, set_id, mode, rating, outcome, duration_ms, created_at)
         VALUES ('c1', 's1', 'flashcards', 1, 'correct', 100, ?)",
    )
    .bind(now)
    .execute(&pool)
    .await
    .expect("review");
    sqlx::query(
        "INSERT INTO study_sessions
         (id, set_id, mode, started_at, ended_at, duration_seconds, cards_studied)
         VALUES ('session1', 's1', 'flashcards', ?, ?, 60, 1)",
    )
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .expect("session");
    pool.close().await;

    let upgraded = db::init(&db_path).await.expect("v1.2.2 upgrade");
    let archived: Option<String> =
        sqlx::query_scalar("SELECT archived_at FROM study_sets WHERE id = 's1'")
            .fetch_one(&upgraded)
            .await
            .expect("archived_at column");
    assert!(archived.is_none(), "existing sets stay active");
    let cards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM flashcards WHERE set_id = 's1'")
        .fetch_one(&upgraded)
        .await
        .expect("cards survived");
    let reviews: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_reviews WHERE set_id = 's1'")
        .fetch_one(&upgraded)
        .await
        .expect("reviews survived");
    let learning_days: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM learning_days")
        .fetch_one(&upgraded)
        .await
        .expect("learning day backfill");
    assert_eq!(cards, 1);
    assert_eq!(reviews, 1);
    assert!(learning_days >= 1);

    upgraded.close().await;
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn streak_counts_each_local_day_once_and_survives_restart() {
    let mut db = TestDb::new().await;
    let created = sets::create(&db.pool, set_input("Streak set", vec![card("A", "1")]))
        .await
        .expect("create set");

    // Two completed sessions on the same calendar day must count once.
    for _ in 0..2 {
        let session_id = sessions::start(&db.pool, Some(created.set.id.clone()), "flashcards")
            .await
            .expect("start session");
        sessions::finish(&db.pool, &session_id, 1, 1, 0, 60)
            .await
            .expect("finish session");
    }

    let today = Local::now().date_naive();
    for offset in [1, 2] {
        sessions::record_learning_day(&db.pool, today - Duration::days(offset))
            .await
            .expect("record prior day");
    }

    let today_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM learning_days WHERE day = ?")
        .bind(today.to_string())
        .fetch_one(&db.pool)
        .await
        .expect("today rows");
    assert_eq!(today_rows, 1, "multiple sessions must collapse to one day");

    let stats = statistics::statistics(&db.pool, 30, 30)
        .await
        .expect("statistics");
    assert_eq!(stats.totals.streak_days, 3);
    assert_eq!(stats.totals.longest_streak, 3);
    assert!(stats.totals.studied_today);

    db.reopen().await;
    let after_restart = statistics::statistics(&db.pool, 30, 30)
        .await
        .expect("statistics after restart");
    assert_eq!(after_restart.totals.streak_days, 3);
    assert_eq!(after_restart.totals.longest_streak, 3);
    assert!(after_restart.totals.studied_today);

    db.cleanup().await;
}

#[tokio::test]
async fn archived_sets_are_hidden_from_active_workflows_and_can_be_restored() {
    let mut db = TestDb::new().await;
    let created = sets::create(
        &db.pool,
        set_input("Archive me", vec![card("A", "1"), card("B", "2")]),
    )
    .await
    .expect("create");
    sessions::record_review(
        &db.pool,
        &created.cards[0].card.id,
        Outcome::Correct,
        "flashcards",
        100,
    )
    .await
    .expect("review");

    sets::set_archived(&db.pool, &created.set.id, true)
        .await
        .expect("archive");

    let active = sets::list_summaries(&db.pool, None, None, None, false, false, "recent")
        .await
        .expect("active sets");
    assert!(active.is_empty());

    let archived = sets::list_summaries(&db.pool, None, None, None, false, true, "recent")
        .await
        .expect("archived sets");
    assert_eq!(archived.len(), 1);
    assert!(archived[0].archived_at.is_some());

    let detail = sets::detail(&db.pool, &created.set.id)
        .await
        .expect("archived detail");
    assert_eq!(detail.cards.len(), 2);
    assert_eq!(detail.cards[0].progress.correct_count, 1);

    assert!(
        sets::ensure_active(&db.pool, &created.set.id)
            .await
            .is_err(),
        "archived sets must not enter active learning workflows"
    );

    let stats = statistics::statistics(&db.pool, 30, 30)
        .await
        .expect("statistics");
    assert_eq!(stats.totals.sets, 0);
    assert_eq!(stats.totals.cards, 0);
    assert!(stats.sets.is_empty());
    assert_eq!(stats.totals.streak_days, 1);

    db.reopen().await;
    let after_restart = sets::list_summaries(&db.pool, None, None, None, false, true, "recent")
        .await
        .expect("archive after restart");
    assert_eq!(after_restart.len(), 1);

    sets::set_archived(&db.pool, &created.set.id, false)
        .await
        .expect("restore");
    let restored = sets::list_summaries(&db.pool, None, None, None, false, false, "recent")
        .await
        .expect("restored sets");
    assert_eq!(restored.len(), 1);
    assert!(restored[0].archived_at.is_none());

    sets::delete(&db.pool, &created.set.id)
        .await
        .expect("delete restored set");
    db.cleanup().await;
}

#[tokio::test]
async fn documents_can_be_removed_without_touching_other_material() {
    let db = TestDb::new().await;

    let first = documents::insert_text(&db.pool, "First PDF", "alpha material", "material")
        .await
        .expect("first document");
    let second = documents::insert_text(&db.pool, "Second DOCX", "beta material", "material")
        .await
        .expect("second document");

    let source = documents::text_for_ids(&db.pool, &[first.id.clone(), second.id.clone()])
        .await
        .expect("combined source");
    assert!(source.contains("alpha material"));
    assert!(source.contains("beta material"));

    documents::delete(&db.pool, &first.id)
        .await
        .expect("delete first document");

    let remaining = documents::list(&db.pool, Some("material".into()))
        .await
        .expect("remaining documents");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, second.id);
    assert!(documents::get(&db.pool, &first.id).await.is_err());

    // Stale document IDs are ignored rather than breaking AI generation.
    let after_removal = documents::text_for_ids(&db.pool, &[first.id, second.id])
        .await
        .expect("source after removal");
    assert!(!after_removal.contains("alpha material"));
    assert!(after_removal.contains("beta material"));

    // Deleting an already missing row is idempotent for stale references.
    documents::delete(&db.pool, "missing-document")
        .await
        .expect("idempotent delete");

    db.cleanup().await;
}

#[tokio::test]
async fn global_statistics_remain_available_after_deleting_the_last_set() {
    let db = TestDb::new().await;
    let created = sets::create(&db.pool, set_input("Temporary", vec![card("A", "1")]))
        .await
        .expect("create");
    sessions::record_review(
        &db.pool,
        &created.cards[0].card.id,
        Outcome::Correct,
        "flashcards",
        100,
    )
    .await
    .expect("review");
    sets::delete(&db.pool, &created.set.id)
        .await
        .expect("delete");

    let stats = statistics::statistics(&db.pool, 30, 30)
        .await
        .expect("global statistics after deleting the last set");
    assert_eq!(stats.totals.sets, 0);
    assert!(stats.sets.is_empty());
    assert_eq!(stats.totals.streak_days, 1);
    assert_eq!(stats.totals.longest_streak, 1);
    assert!(stats.totals.studied_today);

    let dashboard = statistics::dashboard(&db.pool, 30)
        .await
        .expect("dashboard after deleting the last set");
    assert_eq!(dashboard.totals.sets, 0);
    assert_eq!(dashboard.activity.len(), 14);

    db.cleanup().await;
}
