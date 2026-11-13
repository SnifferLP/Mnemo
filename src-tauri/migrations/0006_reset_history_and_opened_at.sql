-- A set reset keeps its learning history, and sets record when they were opened.
--
-- 1.2.6-rc.1 flagged the review, session and test rows of a reset set as
-- `hidden_by_reset`. Reviews and sessions are historical records: the set's
-- "Last 30 Days" chart and its review history must survive a reset, so those
-- flags are cleared and the two columns are removed again. Only test results
-- stay reset-scoped, because a reset clears test progress by design.
UPDATE card_reviews SET hidden_by_reset = 0;
UPDATE study_sessions SET hidden_by_reset = 0;
ALTER TABLE card_reviews DROP COLUMN hidden_by_reset;
ALTER TABLE study_sessions DROP COLUMN hidden_by_reset;

-- Opening a set is a durable event that the dashboard sorts by, so it is
-- stored instead of living in component state. NULL means "never opened".
ALTER TABLE study_sets ADD COLUMN last_opened_at TEXT;
