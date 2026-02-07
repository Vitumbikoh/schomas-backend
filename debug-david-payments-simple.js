const { Client } = require('pg');

async function debugDavidPayments() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'schomas',
    user: 'postgres',
    password: 'g1Bird fly'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get David's student ID
    const studentResult = await client.query(`
      SELECT s.id, s."studentId", s."firstName", s."lastName"
      FROM student s
      WHERE s."studentId" = '260039'
    `);

    if (studentResult.rows.length === 0) {
      console.log('❌ Student 260039 not found');
      return;
    }

    const student = studentResult.rows[0];
    console.log(`📋 Student: ${student.firstName} ${student.lastName} (${student.studentId})`);
    console.log(`   UUID: ${student.id}\n`);

    // Get ALL payments
    const paymentsResult = await client.query(`
      SELECT 
        fp.id,
        fp.amount,
        fp."paymentDate",
        fp."paymentMethod",
        fp."receiptNumber",
        fp.status,
        fp.notes,
        fp."termId",
        t."termNumber",
        ac.term as academic_year
      FROM fee_payment fp
      LEFT JOIN term t ON fp."termId" = t.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE fp."studentId" = $1
      ORDER BY fp."paymentDate" DESC
    `, [student.id]);

    console.log(`💰 Total Payments: ${paymentsResult.rows.length}\n`);
    
    let totalPaid = 0;
    for (const payment of paymentsResult.rows) {
      totalPaid += Number(payment.amount);
      console.log(`Payment ID: ${payment.id}`);
      console.log(`  Amount: ${Number(payment.amount).toLocaleString()}`);
      console.log(`  Date: ${payment.paymentDate}`);
      console.log(`  Method: ${payment.paymentMethod}`);
      console.log(`  Receipt: ${payment.receiptNumber || 'N/A'}`);
      console.log(`  Status: ${payment.status}`);
      console.log(`  Term: ${payment.termNumber ? `Term ${payment.termNumber} (${payment.academic_year})` : 'NO TERM'}`);
      console.log(`  Notes: ${payment.notes || 'N/A'}`);
      console.log('');
    }

    console.log(`📊 Total Paid (Sum): ${totalPaid.toLocaleString()}\n`);

    // Get payment allocations
    console.log(`🔄 Payment Allocations:\n`);
    const allocationsResult = await client.query(`
      SELECT 
        pa.id,
        pa."paymentId",
        pa."allocatedAmount",
        pa."allocationReason",
        fp.amount as payment_amount,
        t."termNumber",
        ac.term as academic_year,
        ft.name as fee_type
      FROM payment_allocation pa
      JOIN fee_payment fp ON pa."paymentId" = fp.id
      LEFT JOIN term t ON pa."termId" = t.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      LEFT JOIN fee_type ft ON pa."feeTypeId" = ft.id
      WHERE fp."studentId" = $1
      ORDER BY fp."paymentDate" DESC
    `, [student.id]);

    if (allocationsResult.rows.length === 0) {
      console.log('  ⚠️  NO ALLOCATIONS FOUND\n');
    } else {
      for (const alloc of allocationsResult.rows) {
        console.log(`Allocation ID: ${alloc.id}`);
        console.log(`  Payment ID: ${alloc.paymentId}`);
        console.log(`  Payment Amount: ${Number(alloc.payment_amount).toLocaleString()}`);
        console.log(`  Allocated: ${Number(alloc.allocatedAmount).toLocaleString()}`);
        console.log(`  To Term: ${alloc.termNumber ? `Term ${alloc.termNumber} (${alloc.academic_year})` : 'NO TERM'}`);
        console.log(`  Fee Type: ${alloc.fee_type || 'N/A'}`);
        console.log(`  Reason: ${alloc.allocationReason || 'N/A'}`);
        console.log('');
      }
    }

    // Get credit ledger
    console.log(`💳 Credit Ledger:\n`);
    const creditsResult = await client.query(`
      SELECT 
        cl.id,
        cl."creditBalance",
        cl."remainingAmount",
        cl."sourcePaymentId",
        cl.status,
        cl."lastUpdated",
        cl.notes
      FROM credit_ledger cl
      WHERE cl."studentId" = $1
      ORDER BY cl."lastUpdated" DESC
    `, [student.id]);

    if (creditsResult.rows.length === 0) {
      console.log('  ℹ️  No credit ledger entries\n');
    } else {
      for (const credit of creditsResult.rows) {
        console.log(`Credit ID: ${credit.id}`);
        console.log(`  Balance: ${Number(credit.creditBalance || 0).toLocaleString()}`);
        console.log(`  Remaining: ${Number(credit.remainingAmount || 0).toLocaleString()}`);
        console.log(`  Source Payment: ${credit.sourcePaymentId || 'N/A'}`);
        console.log(`  Status: ${credit.status}`);
        console.log(`  Last Updated: ${credit.lastUpdated}`);
        console.log(`  Notes: ${credit.notes || 'N/A'}`);
        console.log('');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

debugDavidPayments();
