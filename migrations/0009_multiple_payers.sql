-- Support multiple payers per expense, each for a different amount.
-- expense_payers mirrors expense_splits (one row per member per expense) but
-- records money paid instead of money owed.
CREATE TABLE IF NOT EXISTS expense_payers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

INSERT INTO expense_payers (expense_id, member_id, amount)
SELECT id, paid_by_member_id, amount FROM expenses;

-- expenses.paid_by_member_id is kept: SQLite/D1 cannot DROP COLUMN a column
-- that is part of a foreign key constraint without a full table rebuild.
-- The app no longer reads it; on write it is set to whichever payer
-- contributed the largest amount, purely to satisfy the NOT NULL/FK
-- constraint that still exists on this column.
