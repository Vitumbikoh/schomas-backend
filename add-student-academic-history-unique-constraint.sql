-- Add unique constraint to student_academic_history for credit application tracking
-- This ensures we can upsert records when credits are applied to historical terms

-- First, check if the constraint already exists
DO $$
BEGIN
    -- Add unique constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'student_academic_history_student_term_unique'
    ) THEN
        ALTER TABLE student_academic_history 
        ADD CONSTRAINT student_academic_history_student_term_unique 
        UNIQUE (student_id, term_id);
        
        RAISE NOTICE 'Added unique constraint student_academic_history_student_term_unique';
    ELSE
        RAISE NOTICE 'Unique constraint student_academic_history_student_term_unique already exists';
    END IF;
END $$;

-- Add notes column if it doesn't exist (for tracking credit applications)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'student_academic_history' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE student_academic_history 
        ADD COLUMN notes TEXT;
        
        RAISE NOTICE 'Added notes column to student_academic_history';
    ELSE
        RAISE NOTICE 'Notes column already exists in student_academic_history';
    END IF;
END $$;

-- Verify the changes
SELECT 
    conname AS constraint_name,
    contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'student_academic_history'::regclass
AND conname = 'student_academic_history_student_term_unique';

-- Show sample of records
SELECT COUNT(*) as total_records 
FROM student_academic_history;

COMMENT ON CONSTRAINT student_academic_history_student_term_unique 
ON student_academic_history 
IS 'Ensures one historical record per student per term, enables upsert for credit applications';
