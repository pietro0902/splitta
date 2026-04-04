-- Add category column to expenses
ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT NULL;
