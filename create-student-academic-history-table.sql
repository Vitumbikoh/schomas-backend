-- Create student_academic_history table
-- This table preserves comprehensive historical records of students across academic terms

CREATE TABLE IF NOT EXISTS student_academic_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core references
  student_id UUID NOT NULL,
  academic_calendar_id UUID,
  term_id UUID,
  term_number INTEGER,
  academic_year VARCHAR(50),
  
  -- Enrollment info
  enrollment_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  is_current BOOLEAN DEFAULT false,
  
  -- School context
  school_id UUID NOT NULL,
  class_id UUID,
  class_name VARCHAR(255),
  
  -- Student demographic snapshot
  student_number VARCHAR(100),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255),
  phone_number VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(20),
  address TEXT,
  
  -- Guardian information
  guardian_name VARCHAR(255),
  guardian_phone VARCHAR(50),
  guardian_email VARCHAR(255),
  
  -- Academic status
  admission_date DATE,
  final_status VARCHAR(50) DEFAULT 'active',
  completion_reason VARCHAR(255),
  
  -- Financial snapshot
  total_expected_fees DECIMAL(10,2) DEFAULT 0,
  total_paid_fees DECIMAL(10,2) DEFAULT 0,
  outstanding_fees DECIMAL(10,2) DEFAULT 0,
  last_payment_date DATE,
  
  -- Academic performance
  grade_level VARCHAR(50),
  academic_performance TEXT,
  disciplinary_record TEXT,
  attendance_percentage DECIMAL(5,2),
  
  -- Progression tracking
  promoted_to_next_level BOOLEAN DEFAULT false,
  graduation_status VARCHAR(50),
  certificate_issued BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT uk_student_term UNIQUE (student_id, term_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sah_student_id ON student_academic_history(student_id);
CREATE INDEX IF NOT EXISTS idx_sah_school_id ON student_academic_history(school_id);
CREATE INDEX IF NOT EXISTS idx_sah_term_id ON student_academic_history(term_id);
CREATE INDEX IF NOT EXISTS idx_sah_academic_calendar_id ON student_academic_history(academic_calendar_id);
CREATE INDEX IF NOT EXISTS idx_sah_class_id ON student_academic_history(class_id);
CREATE INDEX IF NOT EXISTS idx_sah_student_number ON student_academic_history(student_number);
CREATE INDEX IF NOT EXISTS idx_sah_final_status ON student_academic_history(final_status);
CREATE INDEX IF NOT EXISTS idx_sah_is_current ON student_academic_history(is_current);
CREATE INDEX IF NOT EXISTS idx_sah_term_number ON student_academic_history(term_number);
CREATE INDEX IF NOT EXISTS idx_sah_academic_year ON student_academic_history(academic_year);

-- Create composite indexes
CREATE INDEX IF NOT EXISTS idx_sah_school_term ON student_academic_history(school_id, term_id);
CREATE INDEX IF NOT EXISTS idx_sah_student_school ON student_academic_history(student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_sah_calendar_term ON student_academic_history(academic_calendar_id, term_number);

COMMENT ON TABLE student_academic_history IS 'Preserves comprehensive historical records of students across academic terms';
COMMENT ON COLUMN student_academic_history.student_id IS 'Reference to student (preserved even if student is deleted)';
COMMENT ON COLUMN student_academic_history.is_current IS 'Whether this is the student current active term';
COMMENT ON COLUMN student_academic_history.final_status IS 'Final status: active, completed, promoted, graduated, transferred, withdrawn';
COMMENT ON COLUMN student_academic_history.completion_reason IS 'Reason for term completion or status change';
