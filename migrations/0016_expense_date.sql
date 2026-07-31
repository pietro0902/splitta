-- When the money was actually spent, as distinct from when the row was typed.
--
-- Until now `created_at` was doing both jobs and could only ever be "now": the
-- column is DEFAULT (datetime('now')) and no code path ever wrote it. So last
-- night's dinner, entered this morning, was filed under this morning -- and
-- since the app is almost always used after the fact, that was most expenses.
--
-- Both columns stay. `created_at` remains the insertion order, which is what
-- breaks ties between expenses sharing a day and what a receipt is grouped by;
-- `spent_at` is the date the user is allowed to choose.
ALTER TABLE expenses ADD COLUMN spent_at TEXT;

-- Backfill: for everything written before this migration the two are the same
-- thing by definition. Doing it now means readers can treat `spent_at` as
-- present, with COALESCE only as a belt-and-braces guard.
UPDATE expenses SET spent_at = created_at WHERE spent_at IS NULL;

-- getExpenses orders by this and filters by group.
CREATE INDEX IF NOT EXISTS idx_expenses_group_spent_at ON expenses(group_id, spent_at);
