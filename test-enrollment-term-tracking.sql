-- Test script: Verify enrollment term tracking is working correctly
-- Run after applying add-enrollment-term-tracking.sql migration

\echo '================================================'
\echo '🧪 Testing Student Enrollment Term Tracking'
\echo '================================================'
\echo ''

-- Test 1: Verify column exists
\echo '✅ Test 1: Verify enrollmentTermId column exists'
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'student' 
AND column_name = 'enrollmentTermId';

\echo ''
\echo '✅ Test 2: Verify foreign key constraint exists'
SELECT 
    conname AS constraint_name,
    contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'student'::regclass
AND conname = 'fk_student_enrollment_term';

\echo ''
\echo '✅ Test 3: Count students with vs without enrollment term'
SELECT 
    COUNT(*) FILTER (WHERE "enrollmentTermId" IS NOT NULL) as with_enrollment_term,
    COUNT(*) FILTER (WHERE "enrollmentTermId" IS NULL) as without_enrollment_term,
    COUNT(*) as total_active_students
FROM student
WHERE "isActive" = true;

\echo ''
\echo '✅ Test 4: Check Lucy Nyong (Student ID: 260040)'
\echo 'Expected: enrollmentTermId should be set to Term 2'
SELECT 
    s."studentId" as student_number,
    s."firstName" || ' ' || s."lastName" as name,
    t_current."termNumber" as current_term,
    t_enroll."termNumber" as enrollment_term,
    ac_enroll.term as enrollment_academic_year,
    t_enroll."startDate" as enrollment_start_date
FROM student s
LEFT JOIN term t_current ON s."termId" = t_current.id
LEFT JOIN term t_enroll ON s."enrollmentTermId" = t_enroll.id
LEFT JOIN academic_calendar ac_enroll ON t_enroll."academicCalendarId" = ac_enroll.id
WHERE s."studentId" = '260040';

\echo ''
\echo '✅ Test 5: Distribution of students by enrollment term'
SELECT 
    t."termNumber",
    ac.term as academic_year,
    COUNT(*) as student_count,
    string_agg(DISTINCT s."studentId", ', ' ORDER BY s."studentId") as sample_student_ids
FROM student s
JOIN term t ON s."enrollmentTermId" = t.id
JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
WHERE s."isActive" = true
GROUP BY t."termNumber", ac.term, t."startDate"
ORDER BY t."startDate", t."termNumber";

\echo ''
\echo '✅ Test 6: Verify term filtering logic (Terms >= Enrollment Term)'
\echo 'For Lucy Nyong, should show only Term 2 and Term 3'
WITH lucy_data AS (
    SELECT 
        s.id as student_id,
        s."studentId" as student_number,
        s."enrollmentTermId",
        t_enroll."startDate" as enrollment_start_date
    FROM student s
    LEFT JOIN term t_enroll ON s."enrollmentTermId" = t_enroll.id
    WHERE s."studentId" = '260040'
)
SELECT 
    ld.student_number,
    t."termNumber",
    ac.term as academic_year,
    t."startDate",
    CASE 
        WHEN t."startDate" >= ld.enrollment_start_date THEN '✅ Include'
        ELSE '❌ Exclude'
    END as should_charge_fees
FROM lucy_data ld
CROSS JOIN term t
LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
WHERE t."schoolId" = (SELECT "schoolId" FROM student WHERE "studentId" = '260040')
ORDER BY t."startDate", t."termNumber";

\echo ''
\echo '✅ Test 7: Sample of students showing current vs enrollment term'
SELECT 
    s."studentId" as student_number,
    s."firstName" || ' ' || s."lastName" as name,
    t_current."termNumber" as current_term,
    t_enroll."termNumber" as enrollment_term,
    ac_current.term as current_year,
    ac_enroll.term as enrollment_year,
    CASE 
        WHEN s."enrollmentTermId" IS NULL THEN '⚠️  No enrollment term'
        WHEN s."enrollmentTermId" = s."termId" THEN '✅ Same as current'
        ELSE '📌 Different'
    END as status
FROM student s
LEFT JOIN term t_current ON s."termId" = t_current.id
LEFT JOIN term t_enroll ON s."enrollmentTermId" = t_enroll.id
LEFT JOIN academic_calendar ac_current ON t_current."academicCalendarId" = ac_current.id
LEFT JOIN academic_calendar ac_enroll ON t_enroll."academicCalendarId" = ac_enroll.id
WHERE s."isActive" = true
ORDER BY s."createdAt" DESC
LIMIT 15;

\echo ''
\echo '================================================'
\echo '✅ All tests completed!'
\echo 'Please verify the results above.'
\echo '================================================'
