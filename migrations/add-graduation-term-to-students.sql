-- Add graduationTermId column to student table
-- This tracks when each student graduated to properly calculate historical fees

-- Add the column (nullable since not all students are graduated)
ALTER TABLE student 
ADD COLUMN IF NOT EXISTS "graduationTermId" UUID NULL;

-- Add foreign key constraint to term table
ALTER TABLE student 
ADD CONSTRAINT fk_student_graduation_term 
FOREIGN KEY ("graduationTermId") REFERENCES term(id) 
ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_student_graduation_term 
ON student("graduationTermId");

-- Comment for documentation
COMMENT ON COLUMN student."graduationTermId" IS 'The term in which the student graduated. Used as cutoff for fee calculations.';

-- For existing graduated students (those in "Graduated" class), 
-- set their graduationTermId to Term 3 of 2024-2025 academic calendar
-- This query can be run separately after verifying the term ID
-- UPDATE student s
-- SET "graduationTermId" = (
--   SELECT t.id 
--   FROM term t 
--   JOIN academic_calendar ac ON t."academicCalendarId" = ac.id 
--   WHERE ac.term = '2024-2025' AND t."termNumber" = 3 
--   AND t."schoolId" = s."schoolId"
--   LIMIT 1
-- )
-- WHERE s."classId" IN (SELECT id FROM classes WHERE name ILIKE '%graduated%');
