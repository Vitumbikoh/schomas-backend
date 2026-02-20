-- Migration: enforce case-insensitive uniqueness on class name per school
-- Drops the old case-sensitive unique index (if present) and creates
-- a unique index on (schoolId, lower(name)) so "Form Two" and "form two"
-- will be treated as duplicates.

BEGIN;

-- Drop the old index if it exists (safe operation)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND n.nspname = 'public' AND c.relname = 'UQ_class_name_school'
  ) THEN
    EXECUTE 'DROP INDEX public."UQ_class_name_school"';
  END IF;
END$$;

-- Create a case-insensitive unique index for names scoped by school
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_class_name_school_ci"
ON classes ("schoolId", lower(name));

COMMIT;
