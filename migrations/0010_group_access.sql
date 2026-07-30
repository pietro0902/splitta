-- Who is allowed to see and touch a group.
--
-- Splitta still has no accounts. Identity is an opaque random client id kept in
-- an HTTP-only cookie (src/lib/session.ts), and a row in this table is the only
-- thing that grants access to a group. Until now "my groups" lived in
-- localStorage, which the server never saw: every group was readable and every
-- mutation was callable by anyone who could reach the deployment.
--
-- member_id records which member of the group this client said they were when
-- redeeming the invite. It is NULL when unknown -- notably for whoever created
-- the group, since the creation form never asks which of the names is them.
--
-- Existing groups get no rows here on purpose: they are reachable again through
-- their invite link, which is the same path a new member takes.
CREATE TABLE IF NOT EXISTS group_access (
  group_id   INTEGER NOT NULL,
  client_id  TEXT NOT NULL,
  member_id  INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, client_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

-- The homepage looks up every group for one client id.
CREATE INDEX IF NOT EXISTS idx_group_access_client ON group_access(client_id);
