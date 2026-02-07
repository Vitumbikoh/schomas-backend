-- Migration: Add enrollment term tracking to student table
-- This prevents students from being charged for fees from terms before they enrolled

-- Step 1: Add enrollmentTermId column to student table
ALTER TABLE student 
ADD COLUMN IF NOT EXISTS "enrollmentTermId" uuid;

-- Step 2: Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_student_enrollment_term'
    ) THEN
        ALTER TABLE student
        ADD CONSTRAINT fk_student_enrollment_term 
        FOREIGN KEY ("enrollmentTermId") 
        REFERENCES term(id) 
        ON DELETE SET NULL;
        
        RAISE NOTICE 'Added foreign key constraint fk_student_enrollment_term';
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_student_enrollment_term already exists';
    END IF;
END $$;

-- Step 3: Backfill enrollmentTermId for existing students
-- Set it to their current termId as a best guess
UPDATE student
SET "enrollmentTermId" = "termId"
WHERE "enrollmentTermId" IS NULL 
  AND "termId" IS NOT NULL;

-- Set to the earliest term in their school for students without a termId
UPDATE student s
SET "enrollmentTermId" = (
    SELECT t.id 
    FROM term t
    WHERE t."schoolId" = s."schoolId"
    ORDER BY t."termNumber" ASC, t."startDate" ASC
    LIMIT 1
)
WHERE "enrollmentTermId" IS NULL 
  AND "schoolId" IS NOT NULL;

-- Step 4: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_student_enrollment_term_id 
ON student("enrollmentTermId");

-- Verification queries
SELECT 
    COUNT(*) FILTER (WHERE "enrollmentTermId" IS NOT NULL) as students_with_enrollment_term,
    COUNT(*) FILTER (WHERE "enrollmentTermId" IS NULL) as students_without_enrollment_term,
    COUNT(*) as total_students
FROM student
WHERE "isActive" = true;

-- Show sample of updated students
SELECT 
    s."firstName",
    s."lastName",
    s."studentId" as "student_number",
    t_current."termNumber" as current_term,
    t_enroll."termNumber" as enrollment_term,
    ac_current.term as current_academic_year,
    ac_enroll.term as enrollment_academic_year
FROM student s
LEFT JOIN term t_current ON s."termId" = t_current.id
LEFT JOIN term t_enroll ON s."enrollmentTermId" = t_enroll.id
LEFT JOIN academic_calendar ac_current ON t_current."academicCalendarId" = ac_current.id
LEFT JOIN academic_calendar ac_enroll ON t_enroll."academicCalendarId" = ac_enroll.id
WHERE s."isActive" = true
LIMIT 10;

COMMENT ON COLUMN student."enrollmentTermId" IS 'The term when the student first enrolled. Used to determine which terms to charge fees for (enrollment term onwards only).';
