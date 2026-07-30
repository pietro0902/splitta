-- Store money as integer cents instead of REAL.
--
-- Nothing was visibly broken: the split arithmetic in src/lib/splits.ts already
-- worked in cents and distributed the leftover ones, so the parts summed to the
-- total. What was wrong is what the columns can hold. A REAL cannot represent
-- 0.10, getBalances() adds one per split and per payer across the whole group
-- before rounding once at the end, and the error only has to reach half a cent
-- for balances to stop closing. Converting is a data migration, so it is
-- cheapest now and gets more expensive with every row.
--
-- The old column is dropped rather than left alongside: it is NOT NULL, so
-- leaving it would force every future insert to keep writing a second, stale
-- copy of every amount. None of these columns are indexed or named in a foreign
-- key, which is what SQLite requires to allow DROP COLUMN (see 0009, where
-- expenses.paid_by_member_id could not be dropped for exactly that reason).

ALTER TABLE expenses ADD COLUMN amount_cents INTEGER;
UPDATE expenses SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER);
ALTER TABLE expenses DROP COLUMN amount;

ALTER TABLE expense_splits ADD COLUMN amount_cents INTEGER;
UPDATE expense_splits SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER);
ALTER TABLE expense_splits DROP COLUMN amount;

ALTER TABLE expense_payers ADD COLUMN amount_cents INTEGER;
UPDATE expense_payers SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER);
ALTER TABLE expense_payers DROP COLUMN amount;

ALTER TABLE settlements ADD COLUMN amount_cents INTEGER;
UPDATE settlements SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER);
ALTER TABLE settlements DROP COLUMN amount;

-- expense_splits.weight keeps its name because it is not always money: it holds
-- the raw input for the split mode the expense was entered in -- a percentage
-- for 'percent', a share count for 'shares', and an amount for 'exact'. Only
-- the last of those is a currency value, so only those rows are scaled.
UPDATE expense_splits
   SET weight = CAST(ROUND(weight * 100) AS INTEGER)
 WHERE weight IS NOT NULL
   AND expense_id IN (SELECT id FROM expenses WHERE split_mode = 'exact');
