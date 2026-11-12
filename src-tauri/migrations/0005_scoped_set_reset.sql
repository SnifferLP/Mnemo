-- Resetting a study set must never touch the global learning history.
--
-- `card_reviews`, `study_sessions` and `test_results` are the permanent record
-- behind the dashboard's learned-cards-today number, the daily activity chart,
-- the weekly accuracy and the streak. A set reset therefore keeps every row
-- and only flags the ones it resets here: the set's own statistics ignore
-- flagged rows, while all global aggregates keep counting them exactly as
-- before. Rows recorded after a reset start unflagged, so new activity counts
-- again without any timestamp comparison.
ALTER TABLE card_reviews ADD COLUMN hidden_by_reset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE study_sessions ADD COLUMN hidden_by_reset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_results ADD COLUMN hidden_by_reset INTEGER NOT NULL DEFAULT 0;
