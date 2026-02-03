const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas'
});

async function checkStudentPayments() {
  try {
    await client.connect();

    // Get first student
    const student = (await client.query('SELECT id, "firstName", "lastName" FROM student LIMIT 1')).rows[0];
    console.log(`\nChecking payments for: ${student.firstName} ${student.lastName}\n`);
    console.log('='.repeat(70));

    // Get ALL payments
    const payments = await client.query(
      'SELECT id, amount, "paymentType", "paymentDate", status FROM fee_payment WHERE "studentId" = $1 ORDER BY "paymentDate" DESC',
      [student.id]
    );

    console.log(`\nALL PAYMENTS IN DATABASE (${payments.rows.length} total):`);
    let totalPayments = 0;
    payments.rows.forEach((p, i) => {
      console.log(`${i + 1}. Amount: ${p.amount}, Type: ${p.paymentType}, Status: ${p.status}`);
      totalPayments += parseFloat(p.amount);
    });
    console.log(`\nTOTAL PAYMENTS: ${totalPayments}\n`);
    console.log('='.repeat(70));

    // Get allocations for each payment
    console.log('\nALLOCATIONS FOR EACH PAYMENT:\n');
    let totalAllocated = 0;

    for (const payment of payments.rows) {
      const allocs = await client.query(
        'SELECT id, "allocatedAmount", "feeType", "allocationReason" FROM payment_allocations WHERE "paymentId" = $1',
        [payment.id]
      );

      console.log(`Payment: ${payment.amount} (${payment.paymentType})`);
      
      if (allocs.rows.length === 0) {
        console.log('  ❌ NO ALLOCATIONS - This payment is not allocated!');
      } else {
        allocs.rows.forEach(alloc => {
          console.log(`  ✓ ${alloc.allocatedAmount} → ${alloc.feeType || 'NULL'} (${alloc.allocationReason || 'no reason'})`);
          totalAllocated += parseFloat(alloc.allocatedAmount);
        });
      }
      console.log('');
    }

    console.log('='.repeat(70));
    console.log(`\nTOTAL ALLOCATED: ${totalAllocated}`);
    console.log(`TOTAL PAYMENTS:  ${totalPayments}`);
    console.log(`UNALLOCATED:     ${totalPayments - totalAllocated}\n`);

    // Check fee structures
    const feeStructures = await client.query(
      `SELECT fs."feeType", fs.amount, fs."isOptional" 
       FROM fee_structure fs 
       JOIN student s ON s."termId" = fs."termId"
       WHERE s.id = $1`,
      [student.id]
    );

    console.log('='.repeat(70));
    console.log('\nFEE STRUCTURES FOR STUDENT:\n');
    let totalExpected = 0;
    feeStructures.rows.forEach(fs => {
      console.log(`${fs.feeType}: ${fs.amount}${fs.isOptional ? ' (Optional)' : ''}`);
      if (!fs.isOptional) totalExpected += parseFloat(fs.amount);
    });
    console.log(`\nTOTAL EXPECTED: ${totalExpected}`);
    console.log(`TOTAL PAID:     ${totalPayments}`);
    console.log(`BALANCE:        ${totalPayments - totalExpected} ${totalPayments > totalExpected ? '(CREDIT)' : '(DEBT)'}\n`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkStudentPayments();
