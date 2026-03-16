-- Ensure payments table has school scoping and backfill missing schoolId values
-- Safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS payments
  ADD COLUMN IF NOT EXISTS "schoolId" uuid;

-- Backfill from linked student records when payment row schoolId is null
UPDATE payments p
SET "schoolId" = s."schoolId"
FROM student s
WHERE p."studentId" = s.id
  AND p."schoolId" IS NULL
  AND s."schoolId" IS NOT NULL;

-- Add index for school-scoped analytics queries
CREATE INDEX IF NOT EXISTS idx_payments_schoolid ON payments ("schoolId");
CREATE INDEX IF NOT EXISTS idx_payments_schoolid_paymentdate ON payments ("schoolId", "paymentDate");

-- Add foreign key only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payments_schoolid'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT fk_payments_schoolid
      FOREIGN KEY ("schoolId") REFERENCES school(id)
      ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
