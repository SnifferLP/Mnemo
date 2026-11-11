-- Archive support and a timezone-stable learning-day ledger.
--
-- `learning_days` is deliberately independent of study sets. A calendar day
-- keeps counting toward the streak even after a set is deleted or archived,
-- and multiple activity events on the same local day collapse into one row.
-- New writes use Rust's local calendar date; the backfill below mirrors the
-- old localtime calculations for existing installations.

ALTER TABLE study_sets ADD COLUMN archived_at TEXT;
CREATE INDEX idx_sets_archived ON study_sets(archived_at);

CREATE TABLE learning_days (
    day               TEXT PRIMARY KEY,
    first_recorded_at TEXT NOT NULL
);

INSERT OR IGNORE INTO learning_days (day, first_recorded_at)
SELECT substr(datetime(created_at, 'localtime'), 1, 10), MIN(created_at)
FROM card_reviews
GROUP BY substr(datetime(created_at, 'localtime'), 1, 10);

INSERT OR IGNORE INTO learning_days (day, first_recorded_at)
SELECT substr(datetime(started_at, 'localtime'), 1, 10), MIN(started_at)
FROM study_sessions
WHERE ended_at IS NOT NULL AND cards_studied > 0
GROUP BY substr(datetime(started_at, 'localtime'), 1, 10);