-- Give review history real foreign keys.
--
-- card_reviews originally had no REFERENCES clauses, so deleting a study set
-- removed its cards but left the review rows behind. Those orphans kept feeding
-- dashboard statistics and made an empty library look like it had activity.
--
-- Rebuild the table with cascade deletes and drop rows that no longer belong to
-- an existing card or set. Valid review history is preserved.

CREATE TABLE card_reviews_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    set_id      TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
    mode        TEXT NOT NULL,
    rating      INTEGER NOT NULL,
    outcome     TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

INSERT INTO card_reviews_new (id, card_id, set_id, mode, rating, outcome, duration_ms, created_at)
SELECT r.id, r.card_id, r.set_id, r.mode, r.rating, r.outcome, r.duration_ms, r.created_at
FROM card_reviews r
WHERE EXISTS (SELECT 1 FROM flashcards f WHERE f.id = r.card_id)
  AND EXISTS (SELECT 1 FROM study_sets s WHERE s.id = r.set_id);

DROP TABLE card_reviews;
ALTER TABLE card_reviews_new RENAME TO card_reviews;

CREATE INDEX idx_reviews_created ON card_reviews(created_at);
CREATE INDEX idx_reviews_set ON card_reviews(set_id);
