-- Give a scanned receipt somewhere to live.
--
-- Until now a receipt was not a record: it was a UUID stamped onto N expense
-- rows, with its name copied onto every one of them -- 167 duplicates of the
-- same handful of strings in this database. Anything belonging to the receipt
-- as a whole therefore had nowhere to go, and the most valuable such thing was
-- being thrown away: the total printed on the paper. The parser reads it,
-- reconciles the extracted items against it, shows you whether they agree, and
-- then forgets it. After the fact there is no way to know whether a given scan
-- was trustworthy.
--
-- declared_total_cents is nullable because plenty of receipts are unreadable at
-- the total, and "we could not read it" is a different fact from "it did not
-- match".
CREATE TABLE IF NOT EXISTS receipts (
  id                   TEXT PRIMARY KEY,
  group_id             INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name                 TEXT,
  category             TEXT,
  declared_total_cents INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipts_group_id ON receipts(group_id);

-- Backfill one row per existing receipt. The name is identical across a
-- receipt's lines, so MAX() just picks it. The category may legitimately differ
-- per line (the editor allows it), so MAX() picks one as the receipt-level
-- default -- and today it is uniformly NULL anyway, since the scanner only
-- started asking for a category this morning.
INSERT OR IGNORE INTO receipts (id, group_id, name, category, created_at)
SELECT receipt_id, group_id, MAX(receipt_name), MAX(category), MIN(created_at)
  FROM expenses
 WHERE receipt_id IS NOT NULL
 GROUP BY receipt_id;

-- The duplicated copy goes. Reads keep seeing `receipt_name` on an expense
-- because getExpenses now LEFT JOINs it back in from here, so there is exactly
-- one place it can be written and one place it can be wrong.
--
-- expenses.receipt_id is deliberately left without a foreign key to this table:
-- SQLite cannot add one to an existing table without a full rebuild, and the
-- column is written only by code that creates the receipts row first.
ALTER TABLE expenses DROP COLUMN receipt_name;
