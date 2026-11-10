-- Mnemo core schema
-- All timestamps are RFC3339 UTC strings (comparable lexicographically).

CREATE TABLE folders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
    color       TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_folders_parent ON folders(parent_id);

CREATE TABLE study_sets (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    folder_id        TEXT REFERENCES folders(id) ON DELETE SET NULL,
    language_front   TEXT NOT NULL DEFAULT 'English',
    language_back    TEXT NOT NULL DEFAULT 'English',
    is_favorite      INTEGER NOT NULL DEFAULT 0,
    source           TEXT NOT NULL DEFAULT 'manual',
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    last_studied_at  TEXT
);
CREATE INDEX idx_sets_folder ON study_sets(folder_id);

CREATE TABLE flashcards (
    id          TEXT PRIMARY KEY,
    set_id      TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    front       TEXT NOT NULL,
    back        TEXT NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    hint        TEXT NOT NULL DEFAULT '',
    card_type   TEXT NOT NULL DEFAULT 'term_definition',
    image_path  TEXT,
    audio_path  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_cards_set ON flashcards(set_id, position);

CREATE TABLE tags (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color      TEXT NOT NULL DEFAULT '#8b5cf6',
    created_at TEXT NOT NULL
);

CREATE TABLE study_set_tags (
    set_id TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (set_id, tag_id)
);

CREATE TABLE card_progress (
    card_id         TEXT PRIMARY KEY REFERENCES flashcards(id) ON DELETE CASCADE,
    set_id          TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
    ease_factor     REAL NOT NULL DEFAULT 2.5,
    interval_days   REAL NOT NULL DEFAULT 0,
    repetitions     INTEGER NOT NULL DEFAULT 0,
    lapses          INTEGER NOT NULL DEFAULT 0,
    learning_step   INTEGER NOT NULL DEFAULT 0,
    state           TEXT NOT NULL DEFAULT 'new',
    due_at          TEXT,
    last_reviewed_at TEXT,
    correct_count   INTEGER NOT NULL DEFAULT 0,
    wrong_count     INTEGER NOT NULL DEFAULT 0,
    difficulty      REAL NOT NULL DEFAULT 0.5,
    streak          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_progress_due ON card_progress(due_at);
CREATE INDEX idx_progress_set ON card_progress(set_id);

CREATE TABLE card_reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     TEXT NOT NULL,
    set_id      TEXT NOT NULL,
    mode        TEXT NOT NULL,
    rating      INTEGER NOT NULL,
    outcome     TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX idx_reviews_created ON card_reviews(created_at);
CREATE INDEX idx_reviews_set ON card_reviews(set_id);

CREATE TABLE study_sessions (
    id               TEXT PRIMARY KEY,
    set_id           TEXT REFERENCES study_sets(id) ON DELETE CASCADE,
    mode             TEXT NOT NULL,
    started_at       TEXT NOT NULL,
    ended_at         TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    cards_studied    INTEGER NOT NULL DEFAULT 0,
    correct_count    INTEGER NOT NULL DEFAULT 0,
    incorrect_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_started ON study_sessions(started_at);

CREATE TABLE test_results (
    id               TEXT PRIMARY KEY,
    set_id           TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
    score            REAL NOT NULL,
    total            INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    question_types   TEXT NOT NULL DEFAULT '',
    details          TEXT NOT NULL DEFAULT '[]',
    created_at       TEXT NOT NULL
);
CREATE INDEX idx_test_results_set ON test_results(set_id, created_at);

CREATE TABLE matching_records (
    set_id       TEXT PRIMARY KEY REFERENCES study_sets(id) ON DELETE CASCADE,
    best_seconds REAL NOT NULL,
    pairs        INTEGER NOT NULL,
    achieved_at  TEXT NOT NULL
);

CREATE TABLE ai_providers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,
    base_url    TEXT NOT NULL,
    model       TEXT NOT NULL,
    api_key_enc TEXT,
    temperature REAL NOT NULL DEFAULT 0.7,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE imported_documents (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    source_name TEXT,
    format      TEXT NOT NULL,
    content     TEXT NOT NULL,
    char_count  INTEGER NOT NULL DEFAULT 0,
    kind        TEXT NOT NULL DEFAULT 'material',
    created_at  TEXT NOT NULL
);

CREATE TABLE ai_conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    provider_id TEXT,
    set_id      TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE ai_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);
CREATE INDEX idx_messages_conversation ON ai_messages(conversation_id, created_at);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
