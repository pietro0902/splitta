-- Create settlements table to track payments between members
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
