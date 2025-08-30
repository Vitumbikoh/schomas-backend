-- Comprehensive analysis of exam data issues

-- 1. Check exam data structure
SELECT 
  COUNT(*) as total_exams,
  COUNT(DISTINCT "schoolId") as schools_with_exams,
  COUNT(CASE WHEN "schoolId" IS NULL THEN 1 END) as exams_without_school
FROM exam;

-- 2. Check teacher-exam relationships
SELECT 
  e.id as exam_id,
  e.title,
  e."teacherId" as exam_teacher_id,
  t.id as teacher_id,
  t."userId" as teacher_user_id,
  t."firstName" || ' ' || t."lastName" as teacher_name,
  CASE 
    WHEN e."teacherId" = t.id THEN 'CORRECT (teacher.id)'
    WHEN e."teacherId" = t."userId" THEN 'INCORRECT (teacher.userId)'
    ELSE 'NO MATCH'
  END as relationship_status
FROM exam e
LEFT JOIN teacher t ON (e."teacherId" = t.id OR e."teacherId" = t."userId")
ORDER BY e.title;

-- 3. Check school relationships
SELECT 
  e.id as exam_id,
  e.title,
  e."schoolId" as exam_school_id,
  t."schoolId" as teacher_school_id,
  c."schoolId" as class_school_id,
  co."schoolId" as course_school_id,
  CASE 
    WHEN e."schoolId" IS NOT NULL THEN 'HAS SCHOOL'
    WHEN t."schoolId" IS NOT NULL THEN 'CAN DERIVE FROM TEACHER'
    WHEN c."schoolId" IS NOT NULL THEN 'CAN DERIVE FROM CLASS'
    WHEN co."schoolId" IS NOT NULL THEN 'CAN DERIVE FROM COURSE'
    ELSE 'NO SCHOOL REFERENCE'
  END as school_status
FROM exam e
LEFT JOIN teacher t ON (e."teacherId" = t.id OR e."teacherId" = t."userId")
LEFT JOIN classes c ON e."classId" = c.id
LEFT JOIN course co ON e."courseId" = co.id
ORDER BY e.title;

-- 4. Check users and their school associations
SELECT 
  u.id,
  u.email,
  u.role,
  u."schoolId" as user_school_id,
  t."schoolId" as teacher_school_id,
  t."firstName" || ' ' || t."lastName" as teacher_name
FROM "user" u
LEFT JOIN teacher t ON u.id = t."userId"
WHERE u.role IN ('ADMIN', 'TEACHER', 'FINANCE')
ORDER BY u.role, u.email;

-- 5. Term check
SELECT 
  e.id, 
  e.title, 
  e."TermId",
  ay.id as Term_exists,
  ay."startDate",
  ay."endDate"
FROM exam e
LEFT JOIN Term ay ON e."TermId" = ay.id;
