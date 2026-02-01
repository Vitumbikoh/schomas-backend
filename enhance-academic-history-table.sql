-- Enhanced Academic History Table
-- This migration adds comprehensive fields for preserving student academic history

-- Add new columns to student_academic_history table for complete historical preservation
ALTER TABLE student_academic_history 
ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES class(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS class_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS student_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS admission_date DATE,
ADD COLUMN IF NOT EXISTS final_status VARCHAR(50) DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS completion_reason VARCHAR(255),
ADD COLUMN IF NOT EXISTS total_expected_fees DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid_fees DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS outstanding_fees DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_payment_date DATE,
ADD COLUMN IF NOT EXISTS grade_level VARCHAR(50),
ADD COLUMN IF NOT EXISTS academic_performance TEXT,
ADD COLUMN IF NOT EXISTS disciplinary_record TEXT,
ADD COLUMN IF NOT EXISTS attendance_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS promoted_to_next_level BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS graduation_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS certificate_issued BOOLEAN DEFAULT false;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_student_academic_history_class_id ON student_academic_history(class_id);
CREATE INDEX IF NOT EXISTS idx_student_academic_history_student_number ON student_academic_history(student_number);
CREATE INDEX IF NOT EXISTS idx_student_academic_history_final_status ON student_academic_history(final_status);
CREATE INDEX IF NOT EXISTS idx_student_academic_history_completion_reason ON student_academic_history(completion_reason);
CREATE INDEX IF NOT EXISTS idx_student_academic_history_last_payment_date ON student_academic_history(last_payment_date);
CREATE INDEX IF NOT EXISTS idx_student_academic_history_grade_level ON student_academic_history(grade_level);
CREATE INDEX IF NOT EXISTS idx_student_academic_history_academic_calendar_term ON student_academic_history(academic_calendar_id, term_number);

-- Create view for easy access to complete historical student data
CREATE OR REPLACE VIEW v_complete_student_history AS
SELECT 
  sah.id,
  sah.student_id,
  sah.academic_calendar_id,
  sah.term_id,
  sah.term_number,
  sah.academic_year,
  sah.enrollment_date,
  sah.status,
  sah.is_current,
  sah.school_id,
  sah.class_id,
  sah.class_name,
  sah.student_number,
  sah.first_name,
  sah.last_name,
  sah.email,
  sah.phone_number,
  sah.date_of_birth,
  sah.gender,
  sah.address,
  sah.guardian_name,
  sah.guardian_phone,
  sah.guardian_email,
  sah.admission_date,
  sah.final_status,
  sah.completion_reason,
  sah.total_expected_fees,
  sah.total_paid_fees,
  sah.outstanding_fees,
  sah.last_payment_date,
  sah.grade_level,
  sah.academic_performance,
  sah.disciplinary_record,
  sah.attendance_percentage,
  sah.promoted_to_next_level,
  sah.graduation_status,
  sah.certificate_issued,
  sah.created_at,
  sah.updated_at,
  -- Additional computed fields
  CASE 
    WHEN sah.total_expected_fees > 0 THEN 
      ROUND((sah.total_paid_fees / sah.total_expected_fees * 100), 2)
    ELSE 0 
  END as payment_percentage,
  CASE 
    WHEN sah.outstanding_fees = 0 THEN 'paid'
    WHEN sah.total_paid_fees > 0 THEN 'partial'
    ELSE 'unpaid'
  END as payment_status,
  -- Join current school and academic calendar info
  s.name as school_name,
  ac.term as academic_calendar_name,
  ac."startDate" as academic_year_start,
  ac."endDate" as academic_year_end
FROM student_academic_history sah
LEFT JOIN school s ON sah.school_id = s.id
LEFT JOIN academic_calendar ac ON sah.academic_calendar_id = ac.id;

-- Create summary view for academic calendar historical data
CREATE OR REPLACE VIEW v_academic_calendar_history_summary AS
SELECT 
  ac.id as academic_calendar_id,
  ac.term as academic_year,
  ac."startDate" as year_start,
  ac."endDate" as year_end,
  ac."isActive" as is_current,
  s.name as school_name,
  COUNT(DISTINCT sah.term_id) as total_terms,
  COUNT(DISTINCT sah.student_id) as unique_students,
  COUNT(*) as total_enrollments,
  SUM(sah.total_expected_fees) as total_expected_revenue,
  SUM(sah.total_paid_fees) as total_collected_revenue,
  SUM(sah.outstanding_fees) as total_outstanding_revenue,
  CASE 
    WHEN SUM(sah.total_expected_fees) > 0 THEN 
      ROUND((SUM(sah.total_paid_fees) / SUM(sah.total_expected_fees) * 100), 2)
    ELSE 0 
  END as collection_percentage,
  COUNT(CASE WHEN sah.promoted_to_next_level = true THEN 1 END) as students_promoted,
  COUNT(CASE WHEN sah.certificate_issued = true THEN 1 END) as certificates_issued,
  MIN(sah.created_at) as first_record_date,
  MAX(sah.updated_at) as last_update_date
FROM academic_calendar ac
LEFT JOIN student_academic_history sah ON ac.id = sah.academic_calendar_id
LEFT JOIN school s ON ac."schoolId" = s.id
GROUP BY ac.id, ac.term, ac."startDate", ac."endDate", ac."isActive", s.name
ORDER BY ac.term DESC;

-- Create summary view for term historical data
CREATE OR REPLACE VIEW v_term_history_summary AS
SELECT 
  t.id as term_id,
  t."termNumber",
  t.status as term_status,
  t."startDate" as term_start,
  t."endDate" as term_end,
  ac.id as academic_calendar_id,
  ac.term as academic_year,
  s.name as school_name,
  COUNT(DISTINCT sah.student_id) as enrolled_students,
  COUNT(*) as total_records,
  SUM(sah.total_expected_fees) as expected_fees,
  SUM(sah.total_paid_fees) as collected_fees,
  SUM(sah.outstanding_fees) as outstanding_fees,
  CASE 
    WHEN SUM(sah.total_expected_fees) > 0 THEN 
      ROUND((SUM(sah.total_paid_fees) / SUM(sah.total_expected_fees) * 100), 2)
    ELSE 0 
  END as collection_percentage,
  AVG(sah.attendance_percentage) as average_attendance,
  COUNT(CASE WHEN sah.promoted_to_next_level = true THEN 1 END) as students_promoted,
  MIN(sah.created_at) as preservation_date,
  MAX(sah.updated_at) as last_update_date
FROM term t
LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
LEFT JOIN student_academic_history sah ON t.id = sah.term_id
LEFT JOIN school s ON t."schoolId" = s.id
GROUP BY t.id, t."termNumber", t.status, t."startDate", t."endDate", 
         ac.id, ac.term, s.name
ORDER BY ac.term DESC, t."termNumber";

COMMENT ON TABLE student_academic_history IS 'Comprehensive historical record of student enrollments, academic progress, and financial data for closed terms and academic calendars';
COMMENT ON VIEW v_complete_student_history IS 'Complete view of historical student data with computed payment status and academic calendar information';
COMMENT ON VIEW v_academic_calendar_history_summary IS 'Summary statistics for closed academic calendars including financial and academic performance metrics';
COMMENT ON VIEW v_term_history_summary IS 'Summary statistics for individual terms including enrollment and financial data';