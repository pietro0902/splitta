-- Support unequal split modes (exact amounts, percentages, shares)
-- split_mode on the expense records how the split was entered so the editor can reopen in the same mode.
-- weight on each split stores the raw input for that mode (euro amount / percent / share count); NULL for equal.
ALTER TABLE expenses ADD COLUMN split_mode TEXT NOT NULL DEFAULT 'equal';
ALTER TABLE expense_splits ADD COLUMN weight REAL DEFAULT NULL;
