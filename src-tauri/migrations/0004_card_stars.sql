-- Per-term starring.
--
-- The flag lives on the card row itself, so it travels with the card through
-- every learning mode, survives restarts and never touches SM-2 progress or
-- review history. Existing cards start unstarred.

ALTER TABLE flashcards ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_cards_starred ON flashcards(set_id, is_starred);
