-- Give every group an invite link.
--
-- 0004 added groups.invite_token but never backfilled it, so any group created
-- before that migration still has NULL. That was harmless while every group was
-- readable by anyone who knew its id.
--
-- It stopped being harmless in 0010. A group is now reachable only through an
-- access row or its invite token, and the action that would mint a missing
-- token (getInviteToken) itself requires access -- so a group with neither is
-- unreachable by everyone, permanently, with no path for the app to repair
-- itself. Backfilling here is what makes "re-join through your invite link" a
-- recovery route for *every* existing group rather than most of them.
--
-- randomblob(16) is 128 bits from SQLite's own CSPRNG, hex-encoded: the same
-- shape and the same unguessability as the crypto.randomUUID() the app
-- generates for new groups. randomblob() is non-deterministic, so SQLite
-- evaluates it once per row rather than hoisting one value out of the loop --
-- which matters, because a single shared token would hand every group to
-- everybody and the UNIQUE index on the column would reject it anyway.
UPDATE groups
   SET invite_token = lower(hex(randomblob(16)))
 WHERE invite_token IS NULL;
