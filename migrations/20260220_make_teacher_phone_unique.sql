-- Migration: enforce unique phoneNumber per school for teachers
BEGIN;

-- Drop old index if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND n.nspname = 'public' AND c.relname = 'UQ_teacher_phone_school'
  ) THEN
    EXECUTE 'DROP INDEX public."UQ_teacher_phone_school"';
  END IF;
END$$;

-- Create the unique index on (schoolId, lower(phoneNumber)) to avoid case/format collisions
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_teacher_phone_school"
ON teacher ("schoolId", lower("phoneNumber"));

COMMIT;
