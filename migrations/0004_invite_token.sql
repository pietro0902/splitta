-- Add invite token for magic link sharing
ALTER TABLE groups ADD COLUMN invite_token TEXT;
CREATE UNIQUE INDEX idx_groups_invite_token ON groups(invite_token);
