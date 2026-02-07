-- Debug David Ochieng (260039) Payment Records
-- Check all payments and credit balance

\echo '================================================'
\echo '💰 David Ochieng (260039) - Payment Analysis'
\echo '================================================'
\echo ''

-- Student basic info
\echo 'Step 1: Student Information'
SELECT 
    s.studentNumber,
    u.firstName || ' ' || u.lastName as name,
    c.name as class,
    t.termNumber as enrollment_term,
    t.termNumber || ' - ' || ay.year as enrollment_term_full
FROM student s
JOIN "user" u ON s.userId = u.id
LEFT JOIN class c ON s.classId = c.id
LEFT JOIN term t ON s.enrollmentTermId = t.id
LEFT JOIN academic_year ay ON t.academicYearId = ay.id
WHERE s.studentNumber = '260039';

\echo ''
\echo 'Step 2: All Payment Records'
SELECT 
    fp.id,
    fp.amount,
    fp.paymentDate,
    fp.paymentMethod,
    fp.referenceNumber,
    fp.notes,
    fp.createdAt
FROM fee_payment fp
JOIN student s ON fp.studentId = s.id
WHERE s.studentNumber = '260039'
ORDER BY fp.paymentDate DESC, fp.createdAt DESC;

\echo ''
\echo 'Step 3: Credit Ledger Balance'
SELECT 
    cl.id,
    cl.creditBalance,
    cl.lastUpdated,
    cl.notes
FROM credit_ledger cl
JOIN student s ON cl.studentId = s.id
WHERE s.studentNumber = '260039';

\echo ''
\echo 'Step 4: Credit Transactions History'
SELECT 
    ct.id,
    ct.transactionType,
    ct.amount,
    ct.balanceBefore,
    ct.balanceAfter,
    ct.description,
    ct.createdAt,
    t.termNumber || ' - ' || ay.year as related_term
FROM credit_transaction ct
JOIN student s ON ct.studentId = s.id
LEFT JOIN term t ON ct.termId = t.id
LEFT JOIN academic_year ay ON t.academicYearId = ay.id
WHERE s.studentNumber = '260039'
ORDER BY ct.createdAt DESC;

\echo ''
\echo 'Step 5: Payment Allocations'
SELECT 
    pa.id,
    pa.amount as allocated_amount,
    fp.amount as payment_amount,
    fp.paymentDate,
    t.termNumber || ' - ' || ay.year as allocated_to_term,
    ft.name as fee_type
FROM payment_allocation pa
JOIN fee_payment fp ON pa.paymentId = fp.id
JOIN student s ON fp.studentId = s.id
JOIN term t ON pa.termId = t.id
JOIN academic_year ay ON t.academicYearId = ay.id
LEFT JOIN fee_type ft ON pa.feeTypeId = ft.id
WHERE s.studentNumber = '260039'
ORDER BY fp.paymentDate DESC, pa.createdAt DESC;

\echo ''
\echo '================================================'
\echo '✅ Analysis Complete'
\echo '================================================'
