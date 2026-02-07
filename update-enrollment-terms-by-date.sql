-- Update enrollment terms based on student creation dates
-- Students created today: Term 2 (2025-2026)
-- Older students: Term 1 (2024-2025)

\echo '================================================'
\echo '📝 Updating Student Enrollment Terms'
\echo '================================================'
\echo ''

-- Step 1: Find the term IDs we need
\echo 'Step 1: Identifying terms...'

-- Get Term 1 of 2024-2025
DO $$
DECLARE
    term1_2024_id uuid;
    term2_2025_id uuid;
    today_date date := CURRENT_DATE;
    students_updated_term1 integer;
    students_updated_term2 integer;
BEGIN
    -- Find Term 1 of 2024-2025
    SELECT t.id INTO term1_2024_id
    FROM term t
    JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
    WHERE ac.term = '2024-2025'
      AND t."termNumber" = 1
    LIMIT 1;

    -- Find Term 2 of 2025-2026
    SELECT t.id INTO term2_2025_id
    FROM term t
    JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
    WHERE ac.term = '2025-2026'
      AND t."termNumber" = 2
    LIMIT 1;

    IF term1_2024_id IS NULL THEN
        RAISE EXCEPTION 'Could not find Term 1 of 2024-2025';
    END IF;

    IF term2_2025_id IS NULL THEN
        RAISE EXCEPTION 'Could not find Term 2 of 2025-2026';
    END IF;

    RAISE NOTICE 'Found Term 1 (2024-2025): %', term1_2024_id;
    RAISE NOTICE 'Found Term 2 (2025-2026): %', term2_2025_id;

    -- Update students created today to Term 2 (2025-2026)
    UPDATE student
    SET "enrollmentTermId" = term2_2025_id
    WHERE DATE("createdAt") = today_date
    AND "isActive" = true;

    GET DIAGNOSTICS students_updated_term2 = ROW_COUNT;
    RAISE NOTICE 'Updated % students created today to Term 2 (2025-2026)', students_updated_term2;

    -- Update all other active students to Term 1 (2024-2025)
    UPDATE student
    SET "enrollmentTermId" = term1_2024_id
    WHERE DATE("createdAt") < today_date
    AND "isActive" = true;

    GET DIAGNOSTICS students_updated_term1 = ROW_COUNT;
    RAISE NOTICE 'Updated % older students to Term 1 (2024-2025)', students_updated_term1;

END $$;

\echo ''
\echo 'Step 2: Verification - Students by enrollment term'

SELECT 
    t."termNumber",
    ac.term as academic_year,
    COUNT(*) as student_count,
    MIN(s."createdAt"::date) as earliest_created,
    MAX(s."createdAt"::date) as latest_created
FROM student s
JOIN term t ON s."enrollmentTermId" = t.id
JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
WHERE s."isActive" = true
GROUP BY t."termNumber", ac.term, t."startDate"
ORDER BY t."startDate", t."termNumber";

\echo ''
\echo 'Step 3: Sample of updated students'

SELECT 
    s."studentId" as student_number,
    s."firstName" || ' ' || s."lastName" as name,
    s."createdAt"::date as created_date,
    CASE 
        WHEN DATE(s."createdAt") = CURRENT_DATE THEN '📅 Today'
        ELSE '📆 Older'
    END as created_when,
    t."termNumber" as enrollment_term,
    ac.term as enrollment_year
FROM student s
LEFT JOIN term t ON s."enrollmentTermId" = t.id
LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
WHERE s."isActive" = true
ORDER BY s."createdAt" DESC
LIMIT 20;

\echo ''
\echo 'Step 4: Check specific students'
\echo 'Lucy Nyong (260040) - Should be in Term 2 (2025-2026) if created today'

SELECT 
    s."studentId" as student_number,
    s."firstName" || ' ' || s."lastName" as name,
    s."createdAt"::date as created_date,
    t."termNumber" as enrollment_term,
    ac.term as enrollment_year,
    CASE 
        WHEN DATE(s."createdAt") = CURRENT_DATE AND t."termNumber" = 2 AND ac.term = '2025-2026' THEN '✅ Correct'
        WHEN DATE(s."createdAt") < CURRENT_DATE AND t."termNumber" = 1 AND ac.term = '2024-2025' THEN '✅ Correct'
        ELSE '⚠️  Needs Review'
    END as status
FROM student s
LEFT JOIN term t ON s."enrollmentTermId" = t.id
LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
WHERE s."studentId" IN ('260040', '260002', '260001')
ORDER BY s."studentId";

\echo ''
\echo '================================================'
\echo '✅ Update completed!'
\echo 'Review the results above to confirm correctness.'
\echo '================================================'
