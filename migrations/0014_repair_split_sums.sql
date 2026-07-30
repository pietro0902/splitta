-- Repair the expenses whose shares do not add up to the expense.
--
-- These are leftovers from the original split code, which divided with
-- `amount / splitMemberIds.length` and stored the same float for everybody:
-- €3,39 between two people wrote 1,695 twice, and 0012 rounded each of those to
-- 170, giving 340 against an expense of 339. The current code (computeSplits,
-- largest remainder) cannot produce this, so no new rows join the set -- but the
-- old ones never self-heal either, and they are the reason a couple of groups
-- have balances that do not close to exactly zero.
--
-- 40 expenses are affected, every one off by exactly one cent in either
-- direction, and every one has at least one share row, so each can be fixed by
-- moving that cent rather than by re-deriving the whole split. The cent goes to
-- the largest share (ties broken by lowest id), which is where the
-- largest-remainder method would have put it in the first place.
WITH broken AS (
  SELECT e.id AS expense_id,
         e.amount_cents - SUM(s.amount_cents) AS delta
    FROM expenses e
    JOIN expense_splits s ON s.expense_id = e.id
   GROUP BY e.id
  HAVING SUM(s.amount_cents) <> e.amount_cents
),
target AS (
  SELECT b.delta,
         (SELECT s.id
            FROM expense_splits s
           WHERE s.expense_id = b.expense_id
           ORDER BY s.amount_cents DESC, s.id ASC
           LIMIT 1) AS split_id
    FROM broken b
)
UPDATE expense_splits
   SET amount_cents = amount_cents + (SELECT t.delta FROM target t WHERE t.split_id = expense_splits.id)
 WHERE id IN (SELECT split_id FROM target);
