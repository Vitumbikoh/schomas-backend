const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas'
});

async function checkPaymentAllocations() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Get first student
    const studentResult = await client.query('SELECT id, "firstName", "lastName" FROM student LIMIT 1');
    const student = studentResult.rows[0];
    console.log(`Checking payments for: ${student.firstName} ${student.lastName}\n`);

    // Get all payments for this student
    const paymentsResult = await client.query(
      `SELECT id, amount, "paymentType", "paymentDate" 
       FROM fee_payment 
       WHERE "studentId" = $1 
       ORDER BY "paymentDate" DESC`,
      [student.id]
    );

    console.log(`Found ${paymentsResult.rows.length} payments:\n`);

    for (const payment of paymentsResult.rows) {
      console.log(`Payment ID: ${payment.id}`);
      console.log(`  Amount: ${payment.amount}`);
      console.log(`  Type: ${payment.paymentType}`);
      console.log(`  Date: ${payment.paymentDate}`);

      // Get allocations for this payment
      const allocationsResult = await client.query(
        `SELECT id, "allocatedAmount", "feeType", "allocationReason"
         FROM payment_allocations 
         WHERE "paymentId" = $1`,
        [payment.id]
      );

      if (allocationsResult.rows.length > 0) {
        const totalAllocated = allocationsResult.rows.reduce((sum, a) => sum + parseFloat(a.allocatedAmount), 0);
        const unallocated = parseFloat(payment.amount) - totalAllocated;
        
        console.log(`  Allocations (${allocationsResult.rows.length}):`);
        allocationsResult.rows.forEach(alloc => {
          console.log(`    - ${alloc.allocatedAmount} to ${alloc.feeType || 'NULL'} (${alloc.allocationReason || 'No reason'})`);
        });
        console.log(`  Total Allocated: ${totalAllocated}`);
        console.log(`  Unallocated: ${unallocated}`);
      } else {
        console.log(`  NO ALLOCATIONS - Full ${payment.amount} unallocated!`);
      }
      console.log('');
    }

    // Check for payments with NULL or missing feeType in allocations
    const nullFeeTypeResult = await client.query(
      `SELECT pa.id, pa."paymentId", pa."allocatedAmount", pa."feeType", fp.amount as payment_amount
       FROM payment_allocations pa
       JOIN fee_payment fp ON pa."paymentId" = fp.id
       WHERE fp."studentId" = $1 AND (pa."feeType" IS NULL OR pa."feeType" = '')`,
      [student.id]
    );

    if (nullFeeTypeResult.rows.length > 0) {
      console.log(`\n⚠️  Found ${nullFeeTypeResult.rows.length} allocations with NULL/empty feeType:`);
      nullFeeTypeResult.rows.forEach(alloc => {
        console.log(`  Payment: ${alloc.paymentId}, Allocated: ${alloc.allocatedAmount}, FeeType: ${alloc.feeType || 'NULL'}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkPaymentAllocations();
