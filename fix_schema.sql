-- Fix existing data to resolve unique constraint conflict
-- First, let's see what's causing the issue
SELECT 
    "schoolId", 
    "termId", 
    "isDefault",
    COUNT(*) as count
FROM course_term_grade_scheme 
WHERE "isDefault" = false
GROUP BY "schoolId", "termId", "isDefault"
HAVING COUNT(*) > 1;

-- If there are duplicates, we need to remove them or fix them
-- For now, let's add the isDefault column properly if it doesn't exist
ALTER TABLE course_term_grade_scheme 
ADD COLUMN IF NOT EXISTS "isDefault" boolean DEFAULT false;

-- Update all existing records to have isDefault = false if null
UPDATE course_term_grade_scheme 
SET "isDefault" = false 
WHERE "isDefault" IS NULL;

-- Now we can safely create the partial unique index manually
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_DEFAULT_SCHEME_PER_SCHOOL_TERM" 
ON course_term_grade_scheme ("schoolId", "termId") 
WHERE "isDefault" = true;