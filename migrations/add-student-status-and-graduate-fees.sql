-- Migration: Add Student Status Fields and Graduate Outstanding Balance Table
-- Run Date: 2026-02-04
-- Description: Add isActive and related fields to student table, create graduate_outstanding_balance table

-- ========================================
-- PART 1: Add Student Status Columns
-- ========================================

-- Add new columns to student table
ALTER TABLE student 
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "inactivatedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "inactivatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "inactivationReason" VARCHAR(50);

-- Create index for active student queries (performance)
CREATE INDEX IF NOT EXISTS idx_student_active ON student("isActive", "schoolId");
CREATE INDEX IF NOT EXISTS idx_student_inactive_reason ON student("inactivationReason") WHERE "isActive" = false;

-- Mark existing graduated students as inactive
UPDATE student 
SET 
  "isActive" = false,
  "inactivationReason" = 'graduated',
  "inactivatedAt" = NOW()
WHERE "classId" IN (
  SELECT id FROM classes WHERE "numericalName" = 999 AND name = 'Graduated'
);

-- ========================================
-- PART 2: Create Graduate Outstanding Balance Table
-- ========================================

CREATE TABLE IF NOT EXISTS graduate_outstanding_balance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  school_id UUID NOT NULL,
  
  -- Financial snapshot at graduation
  total_expected DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  outstanding_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Term breakdown (JSONB for flexibility)
  term_breakdown JSONB,  -- [{termId, termNumber, expected, paid, outstanding}, ...]
  
  -- Status tracking
  payment_status VARCHAR(50) DEFAULT 'outstanding',  -- 'outstanding', 'partial', 'paid', 'waived'
  last_payment_date TIMESTAMP,
  last_payment_amount DECIMAL(10,2),
  
  -- Graduation details
  graduated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  graduation_term_id UUID,
  graduation_class VARCHAR(100),
  
  -- Notes and history
  notes TEXT,
  payment_plan VARCHAR(50),  -- 'installment', 'cleared', 'negotiated', 'none'
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  
  -- Foreign keys
  CONSTRAINT fk_graduate_student FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE,
  CONSTRAINT fk_graduate_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_graduate_term FOREIGN KEY (graduation_term_id) REFERENCES term(id) ON DELETE SET NULL,
  CONSTRAINT fk_graduate_creator FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_graduate_outstanding_student ON graduate_outstanding_balance(student_id);
CREATE INDEX IF NOT EXISTS idx_graduate_outstanding_school ON graduate_outstanding_balance(school_id);
CREATE INDEX IF NOT EXISTS idx_graduate_outstanding_status ON graduate_outstanding_balance(payment_status);
CREATE INDEX IF NOT EXISTS idx_graduate_outstanding_amount ON graduate_outstanding_balance(outstanding_amount) WHERE outstanding_amount > 0;
CREATE INDEX IF NOT EXISTS idx_graduate_outstanding_date ON graduate_outstanding_balance(graduated_at);

-- ========================================
-- PART 3: Create Trigger for Auto-Update
-- ========================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_graduate_balance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_graduate_balance_updated_at ON graduate_outstanding_balance;
CREATE TRIGGER trigger_graduate_balance_updated_at
  BEFORE UPDATE ON graduate_outstanding_balance
  FOR EACH ROW
  EXECUTE FUNCTION update_graduate_balance_timestamp();

-- ========================================
-- PART 4: Snapshot Existing Graduated Students
-- ========================================

-- Create outstanding balance snapshots for existing graduated students
INSERT INTO graduate_outstanding_balance (
  student_id,
  school_id,
  total_expected,
  total_paid,
  outstanding_amount,
  graduated_at,
  graduation_class,
  payment_status,
  created_at
)
SELECT 
  s.id as student_id,
  s."schoolId" as school_id,
  COALESCE(
    (SELECT COALESCE(SUM(fs.amount), 0)
     FROM fee_structure fs
     WHERE fs."schoolId" = s."schoolId"
       AND fs."isActive" = true
       AND (fs."classId" IS NULL OR fs."classId" = s."classId")
       AND fs."isOptional" = false
    ), 0
  ) as total_expected,
  COALESCE(
    (SELECT COALESCE(SUM(fp.amount), 0)
     FROM fee_payment fp
     WHERE fp."studentId" = s.id
       AND fp.status = 'completed'
    ), 0
  ) as total_paid,
  GREATEST(
    COALESCE(
      (SELECT COALESCE(SUM(fs.amount), 0)
       FROM fee_structure fs
       WHERE fs."schoolId" = s."schoolId"
         AND fs."isActive" = true
         AND (fs."classId" IS NULL OR fs."classId" = s."classId")
         AND fs."isOptional" = false
      ), 0
    ) - COALESCE(
      (SELECT COALESCE(SUM(fp.amount), 0)
       FROM fee_payment fp
       WHERE fp."studentId" = s.id
         AND fp.status = 'completed'
      ), 0
    ), 0
  ) as outstanding_amount,
  COALESCE(s."inactivatedAt", s."updatedAt", NOW()) as graduated_at,
  c.name as graduation_class,
  CASE 
    WHEN GREATEST(
      COALESCE(
        (SELECT COALESCE(SUM(fs.amount), 0)
         FROM fee_structure fs
         WHERE fs."schoolId" = s."schoolId"
           AND fs."isActive" = true
           AND (fs."classId" IS NULL OR fs."classId" = s."classId")
           AND fs."isOptional" = false
        ), 0
      ) - COALESCE(
        (SELECT COALESCE(SUM(fp.amount), 0)
         FROM fee_payment fp
         WHERE fp."studentId" = s.id
           AND fp.status = 'completed'
        ), 0
      ), 0
    ) = 0 THEN 'paid'
    WHEN COALESCE(
      (SELECT COALESCE(SUM(fp.amount), 0)
       FROM fee_payment fp
       WHERE fp."studentId" = s.id
         AND fp.status = 'completed'
      ), 0
    ) > 0 THEN 'partial'
    ELSE 'outstanding'
  END as payment_status,
  NOW() as created_at
FROM student s
LEFT JOIN classes c ON c.id = s."classId"
WHERE s."isActive" = false 
  AND s."inactivationReason" = 'graduated'
  AND NOT EXISTS (
    SELECT 1 FROM graduate_outstanding_balance gob 
    WHERE gob.student_id = s.id
  );

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check student status updates
SELECT 
  COUNT(*) FILTER (WHERE "isActive" = true) as active_students,
  COUNT(*) FILTER (WHERE "isActive" = false) as inactive_students,
  COUNT(*) FILTER (WHERE "inactivationReason" = 'graduated') as graduated_students
FROM student;

-- Check graduate outstanding balances
SELECT 
  payment_status,
  COUNT(*) as count,
  SUM(outstanding_amount) as total_outstanding
FROM graduate_outstanding_balance
GROUP BY payment_status
ORDER BY payment_status;

-- Show sample graduated students
SELECT 
  s."studentId",
  s."firstName",
  s."lastName",
  s."isActive",
  s."inactivationReason",
  c.name as class_name,
  gob.outstanding_amount,
  gob.payment_status
FROM student s
LEFT JOIN classes c ON c.id = s."classId"
LEFT JOIN graduate_outstanding_balance gob ON gob.student_id = s.id
WHERE s."isActive" = false
  AND s."inactivationReason" = 'graduated'
LIMIT 10;
