// Simple DB-level test to simulate an overpayment, allocate across fees, and create credit ledger
// Run with: DB_PASSWORD="your password" node test-overpayment-credit-history.js

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
    console.log('--- Overpayment Credit History Test ---');

    // 1) Identify current academic calendar and a term for the school
    const calRes = await client.query('SELECT id FROM academic_calendar WHERE "isActive" = true LIMIT 1');
    if (calRes.rows.length === 0) throw new Error('No active academic calendar found');
    const academicCalendarId = calRes.rows[0].id;

    const termRes = await client.query(
      'SELECT id, "termNumber", "startDate", "endDate" FROM term WHERE "academicCalendarId" = $1 AND "schoolId" = $2 ORDER BY "termNumber" ASC LIMIT 1',
      [academicCalendarId, schoolId]
    );
    if (termRes.rows.length === 0) throw new Error('No term found for active academic calendar');
    const term = termRes.rows[0];
    console.log('Using Term:', term.termNumber, 'Term ID:', term.id);

    // 2) Find a student with no completed payments
    const studentRes = await client.query(
      'SELECT s.id, s."studentId", s."classId", s."firstName", s."lastName" FROM student s WHERE s."schoolId" = $1 AND NOT EXISTS (SELECT 1 FROM fee_payment fp WHERE fp."studentId" = s.id AND fp.status = \'' + 'completed' + '\') LIMIT 1',
      [schoolId]
    );
    if (studentRes.rows.length === 0) throw new Error('No student without completed payments found');
    const student = studentRes.rows[0];
    console.log('Selected Student:', `${student.firstName} ${student.lastName}`, 'StudentID:', student.studentId);

    // 3) Fetch fee structures applicable to the student
    const feeRes = await client.query(
      'SELECT id, "feeType", amount, "isOptional", "classId" FROM fee_structure WHERE "termId" = $1 AND "isActive" = true AND ("classId" IS NULL OR "classId" = $2) ORDER BY "isOptional" ASC',
      [term.id, student.classId]
    );
    if (feeRes.rows.length === 0) throw new Error('No active fee structures found for this term');
    const fees = feeRes.rows.map(r => ({ id: r.id, feeType: r.feeType, amount: Number(r.amount), isOptional: r.isOptional }));

    const totalExpected = fees.reduce((sum, f) => sum + f.amount, 0);
    const overpayExtra = 300000; // MK
    const paymentAmount = totalExpected + overpayExtra;

    console.log('Total Expected:', totalExpected, 'Payment Amount (overpay):', paymentAmount);

    // 4) Prepare processor user (admin) and insert fee_payment with method/receipt/processor
    const adminRes = await client.query('SELECT id, username FROM "user" WHERE username = $1 OR role = $2 ORDER BY username ASC LIMIT 1', ['rumphiadmin', 'ADMIN']);
    const adminId = adminRes.rows[0]?.id || null;

    const paymentDate = new Date('2026-02-03T00:00:00Z');
    const paymentType = 'Full (allocate across fees)';
    const paymentMethod = 'bank_transfer';
    const receiptNumber = 'RCPT-TEST-OVERPAY-1';

    const insertPaymentRes = await client.query(
      'INSERT INTO fee_payment ("studentId", "termId", "schoolId", amount, "paymentDate", "paymentType", "paymentMethod", status, "receiptNumber", "processedByAdminId") VALUES ($1, $2, $3, $4, $5, $6, $7, \'' + 'completed' + '\', $8, $9) RETURNING id',
      [student.id, term.id, schoolId, paymentAmount, paymentDate, paymentType, paymentMethod, receiptNumber, adminId]
    );
    const paymentId = insertPaymentRes.rows[0].id;
    console.log('Inserted Payment ID:', paymentId);

    // 5) Allocate across fees: mandatory first, then optional
    let remaining = paymentAmount;
    for (const f of fees) {
      const allocAmt = Math.min(f.amount, remaining);
      if (allocAmt <= 0) continue;
      await client.query(
        'INSERT INTO payment_allocations ("paymentId", "termId", "academicCalendarId", "allocatedAmount", "allocationReason", "feeType", "schoolId") VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [paymentId, term.id, academicCalendarId, allocAmt, 'term_fees', f.feeType, schoolId]
      );
      remaining -= allocAmt;
    }

    // 6) Any remainder becomes credit
    if (remaining > 0) {
      await client.query(
        'INSERT INTO credit_ledger ("studentId", "termId", "schoolId", "sourcePaymentId", amount, "remainingAmount", status, notes) VALUES ($1, $2, $3, $4, $5, $6, \'' + 'active' + '\', $7)',
        [student.id, term.id, schoolId, paymentId, remaining, remaining, `Surplus from payment ${paymentId}`]
      );
      console.log('Created credit ledger entry with remaining:', remaining);
    }

    // 7) Verify allocations and credit rows
    const allocCheck = await client.query(
      'SELECT pa."allocatedAmount", pa."feeType" FROM payment_allocations pa WHERE pa."paymentId" = $1 ORDER BY pa."allocatedAmount" DESC',
      [paymentId]
    );
    const creditCheck = await client.query(
      'SELECT cl."remainingAmount" FROM credit_ledger cl WHERE cl."studentId" = $1 AND cl.status = \'' + 'active' + '\' ORDER BY cl."createdAt" DESC LIMIT 1',
      [student.id]
    );

    const totalAlloc = allocCheck.rows.reduce((s, r) => s + Number(r.allocatedAmount), 0);
    const creditRemaining = Number(creditCheck.rows[0]?.remainingAmount || 0);

    // 8) Validate credit inherits method/receipt/processedBy from source payment
    const creditJoin = await client.query(
      'SELECT cl."remainingAmount", fp."paymentMethod", fp."receiptNumber", u.username as processedBy FROM credit_ledger cl LEFT JOIN fee_payment fp ON cl."sourcePaymentId" = fp.id LEFT JOIN "user" u ON fp."processedByAdminId" = u.id WHERE cl."studentId" = $1 ORDER BY cl."createdAt" DESC LIMIT 1',
      [student.id]
    );
    const creditRow = creditJoin.rows[0] || {};

    console.log('Allocated total:', totalAlloc, 'Credit remaining:', creditRemaining);

    const allocHasTuition = allocCheck.rows.some(r => (r.feeType || '').toLowerCase().includes('tuition'));
    const allocHasBoarding = allocCheck.rows.some(r => (r.feeType || '').toLowerCase().includes('boarding'));
    const hasCredit = creditRemaining > 0;

    const pm = creditRow.paymentMethod ?? creditRow.paymentmethod;
    const rc = creditRow.receiptNumber ?? creditRow.receiptnumber;
    const proc = creditRow.processedBy ?? creditRow.processedby;
    if (totalAlloc >= totalExpected && hasCredit && pm === paymentMethod && rc === receiptNumber && !!proc) {
      console.log('✅ TEST PASSED: Allocations cover expected; credit inherits method/receipt/processor');
    } else {
      console.log('❌ TEST FAILED: Expected allocations+credit+inheritance to be present');
      console.log('Debug:', { paymentMethod, receiptNumber, pm, rc, proc, creditJoin: creditJoin.rows[0] });
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
