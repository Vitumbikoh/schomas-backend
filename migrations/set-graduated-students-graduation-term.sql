-- Set graduation term for all existing graduated students
-- This script sets graduationTermId to Term 3 of 2024-2025 academic calendar

-- First, verify the term exists and get its ID
SELECT 
  t.id,
  t."termNumber",
  ac.term as academic_year,
  t."startDate",
  t."endDate",
  COUNT(DISTINCT s.id) as graduated_students_count
FROM term t
JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
LEFT JOIN student s ON s."classId" IN (
  SELECT id FROM classes WHERE name ILIKE '%graduated%'
)
WHERE ac.term = '2024-2025' 
  AND t."termNumber" = 3
GROUP BY t.id, t."termNumber", ac.term, t."startDate", t."endDate";

-- Update graduated students with the graduation term
-- Run this after verifying the term ID above
UPDATE student s
SET "graduationTermId" = (
  SELECT t.id 
  FROM term t 
  JOIN academic_calendar ac ON t."academicCalendarId" = ac.id 
  WHERE ac.term = '2024-2025' 
    AND t."termNumber" = 3 
    AND t."schoolId" = s."schoolId"
  LIMIT 1
)
WHERE s."classId" IN (
  SELECT id FROM classes WHERE name ILIKE '%graduated%'
)
AND s."graduationTermId" IS NULL;  -- Only update if not already set

-- Verify the update
SELECT 
  s.id,
  s."studentId",
  s."firstName",
  s."lastName",
  c.name as class_name,
  gt."termNumber" as graduation_term_number,
  ac.term as graduation_academic_year
FROM student s
LEFT JOIN classes c ON s."classId" = c.id
LEFT JOIN term gt ON s."graduationTermId" = gt.id
LEFT JOIN academic_calendar ac ON gt."academicCalendarId" = ac.id
WHERE c.name ILIKE '%graduated%'
ORDER BY s."lastName", s."firstName";
