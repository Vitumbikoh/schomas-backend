-- Direct SQL test to understand Catherine Wambui's data
-- Student ID: dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2

-- 1. Get student info
SELECT id, "studentId", "firstName", "lastName", "schoolId", "classId"
FROM student 
WHERE id = 'dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2';

-- 2. Get all terms for the school
SELECT id, "termNumber", "schoolId", "isCurrent", "isCompleted", 
       "startDate", "endDate", "academicCalendarId"
FROM term 
WHERE "schoolId" = '4ba487ae-16c8-4403-a6f4-5a0241cbee04'
ORDER BY "startDate" ASC;

-- 3. Get current term
SELECT id, "termNumber", "schoolId", "isCurrent"
FROM term
WHERE "schoolId" = '4ba487ae-16c8-4403-a6f4-5a0241cbee04'
  AND "isCurrent" = true;

-- 4. Get fee structures for each term
SELECT t."termNumber", fs."feeType", fs.amount, fs."isOptional", fs."classId"
FROM term t
LEFT JOIN fee_structure fs ON fs."termId" = t.id
WHERE t."schoolId" = '4ba487ae-16c8-4403-a6f4-5a0241cbee04'
  AND fs."isActive" = true
ORDER BY t."termNumber", fs."feeType";

-- 5. Get payments for Catherine in each term
SELECT t."termNumber", fp.amount, fp."paymentDate", fp.status, fp."termId"
FROM fee_payment fp
JOIN term t ON t.id = fp."termId"
WHERE fp."studentId" = 'dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2'
  AND fp.status = 'completed'
ORDER BY t."termNumber";

-- 6. Get credit balance
SELECT "termId", "remainingAmount", status, "createdAt"
FROM credit_ledger
WHERE "studentId" = 'dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2'
  AND status = 'active'
ORDER BY "createdAt";

-- 7. Calculate expected vs paid per term
WITH term_data AS (
  SELECT 
    t.id as term_id,
    t."termNumber",
    t."isCurrent",
    COALESCE(SUM(CASE 
      WHEN fs."isOptional" = false 
        AND (fs."classId" IS NULL OR fs."classId" = (SELECT "classId" FROM student WHERE id = 'dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2'))
      THEN fs.amount 
      ELSE 0 
    END), 0) as expected_fees,
    COALESCE((
      SELECT SUM(amount) 
      FROM fee_payment 
      WHERE "studentId" = 'dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2' 
        AND "termId" = t.id 
        AND status = 'completed'
    ), 0) as paid_fees
  FROM term t
  LEFT JOIN fee_structure fs ON fs."termId" = t.id AND fs."isActive" = true
  WHERE t."schoolId" = '4ba487ae-16c8-4403-a6f4-5a0241cbee04'
  GROUP BY t.id, t."termNumber", t."isCurrent"
  ORDER BY t."startDate"
)
SELECT 
  "termNumber",
  "isCurrent",
  expected_fees,
  paid_fees,
  (expected_fees - paid_fees) as outstanding
FROM term_data;
