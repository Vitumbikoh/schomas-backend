// Test exact payment scenario: ensure no credit ledger is created and allocations match expected
// Run with: DB_PASSWORD="your password" node test-exact-payment-no-credit.js

const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'schomas',
  });
  await client.connect();
  const schoolId = '4ba487ae-16c8-4403-a6f4-5a0241cbee04';

  try {
    console.log('--- Exact Payment No Credit Test ---');

    // Active calendar and first term
    const calRes = await client.query('SELECT id FROM academic_calendar WHERE "isActive" = true LIMIT 1');
    if (calRes.rows.length === 0) throw new Error('No active academic calendar');
    const academicCalendarId = calRes.rows[0].id;
    const termRes = await client.query(
      'SELECT id, "termNumber" FROM term WHERE "academicCalendarId" = $1 AND "schoolId" = $2 ORDER BY "termNumber" ASC LIMIT 1',
      [academicCalendarId, schoolId]
    );
    if (termRes.rows.length === 0) throw new Error('No term found');
    const term = termRes.rows[0];

    // Student with no completed payments
    const studentRes = await client.query(
      'SELECT s.id, s."studentId", s."classId", s."firstName", s."lastName" FROM student s WHERE s."schoolId" = $1 AND NOT EXISTS (SELECT 1 FROM fee_payment fp WHERE fp."studentId" = s.id AND fp.status = $2) LIMIT 1',
      [schoolId, 'completed']
    );
    if (studentRes.rows.length === 0) throw new Error('No student w/o payments available');
    const student = studentRes.rows[0];

    // Fees
    const feeRes = await client.query(
      'SELECT id, "feeType", amount, "isOptional", "classId" FROM fee_structure WHERE "termId" = $1 AND "isActive" = true AND ("classId" IS NULL OR "classId" = $2) ORDER BY "isOptional" ASC',
      [term.id, student.classId]
    );
    if (feeRes.rows.length === 0) throw new Error('No fee structures');
    const fees = feeRes.rows.map(r => ({ feeType: r.feeType, amount: Number(r.amount) }));
    const totalExpected = fees.reduce((s, f) => s + f.amount, 0);

    // Admin
    const adminRes = await client.query('SELECT id, username FROM "user" WHERE username = $1 OR role = $2 ORDER BY username ASC LIMIT 1', ['rumphiadmin', 'ADMIN']);
    const adminId = adminRes.rows[0]?.id || null;

    // Insert exact payment
    const paymentDate = new Date('2026-02-03T00:00:00Z');
    const receiptNumber = 'RCPT-TEST-EXACT-1';
    const paymentMethod = 'cash';
    const ins = await client.query(
      'INSERT INTO fee_payment ("studentId", "termId", "schoolId", amount, "paymentDate", "paymentType", "paymentMethod", status, "receiptNumber", "processedByAdminId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [student.id, term.id, schoolId, totalExpected, paymentDate, 'Full (allocate across fees)', paymentMethod, 'completed', receiptNumber, adminId]
    );
    const paymentId = ins.rows[0].id;

    // Allocate across all fees
    for (const f of fees) {
      await client.query(
        'INSERT INTO payment_allocations ("paymentId", "termId", "academicCalendarId", "allocatedAmount", "allocationReason", "feeType", "schoolId") VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [paymentId, term.id, academicCalendarId, f.amount, 'term_fees', f.feeType, schoolId]
      );
    }

    // Validate: no credit ledger
    const creditCheck = await client.query('SELECT COUNT(*)::int AS cnt FROM credit_ledger WHERE "studentId" = $1 AND status = $2', [student.id, 'active']);
    const creditCount = creditCheck.rows[0].cnt;

    // Validate: allocations sum equal totalExpected
    const allocCheck = await client.query('SELECT SUM("allocatedAmount")::numeric as sum FROM payment_allocations WHERE "paymentId" = $1', [paymentId]);
    const allocSum = Number(allocCheck.rows[0].sum || 0);

    if (creditCount === 0 && Math.abs(allocSum - totalExpected) < 0.01) {
      console.log('✅ TEST PASSED: Exact payment created, fully allocated, no credit');
    } else {
      console.log('❌ TEST FAILED: Expected no credit and exact allocations');
      console.log({ creditCount, allocSum, totalExpected });
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
