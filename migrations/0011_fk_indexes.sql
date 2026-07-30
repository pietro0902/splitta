-- Index every foreign key the app filters on.
--
-- Only groups.invite_token was indexed, so each of these WHERE clauses was a
-- full table scan whose cost grew with the whole application's data rather than
-- with one group's. That was survivable while a handful of groups existed; it
-- stops being survivable at the point where scoping reads to a caller (0010)
-- actually matters.
CREATE INDEX IF NOT EXISTS idx_members_group_id ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_payers_expense_id ON expense_payers(expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_shopping_items_group_id ON shopping_items(group_id);
