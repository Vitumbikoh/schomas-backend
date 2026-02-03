const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas'
});

async function createMissingPayment() {
  try {
    await client.connect();
    
    // Get student and term
    const student = (await client.query('SELECT id, "termId", "schoolId" FROM student LIMIT 1')).rows[0];
    const adminUser = (await client.query('SELECT id FROM "user" WHERE username = \'rumphiadmin\' LIMIT 1')).rows[0];
    const term = (await client.query('SELECT id, "academicCalendarId" FROM term WHERE id = $1', [student.termId])).rows[0];
    
    console.log('Student ID:', student.id);
    console.log('Term ID:', student.termId);
    console.log('School ID:', student.schoolId);
    console.log('Academic Calendar ID:', term.academicCalendarId);
    console.log('Admin User ID:', adminUser?.id || 'No admin found');
    
    // Create the missing 400,000 payment
    const paymentResult = await client.query(
      `INSERT INTO fee_payment 
       (id, amount, "paymentType", "paymentMethod", status, "paymentDate", "studentId", "termId", "schoolId", "processedByAdminId", "createdAt", "updatedAt", currency)
       VALUES 
       (gen_random_uuid(), 400000, 'Cash', 'cash', 'completed', NOW(), $1, $2, $3, $4, NOW(), NOW(), 'MWK')
       RETURNING id, amount`,
      [student.id, student.termId, student.schoolId, adminUser?.id || null]
    );
    
    const newPaymentId = paymentResult.rows[0].id;
    console.log('\n✅ Created payment:', paymentResult.rows[0].amount, 'ID:', newPaymentId);
    
    // Get fee structures to allocate properly
    const feeStructures = await client.query(
      'SELECT "feeType", amount FROM fee_structure WHERE "termId" = $1 AND "isActive" = true',
      [student.termId]
    );
    
    console.log('\nFee Structures:');
    feeStructures.rows.forEach(fs => console.log(`  ${fs.feeType}: ${fs.amount}`));
    
    // Get current allocations
    const currentAllocations = await client.query(
      `SELECT SUM(pa."allocatedAmount") as total, pa."feeType"
       FROM payment_allocations pa
       JOIN fee_payment fp ON pa."paymentId" = fp.id
       WHERE fp."studentId" = $1
       GROUP BY pa."feeType"`,
      [student.id]
    );
    
    console.log('\nCurrent Allocations:');
    currentAllocations.rows.forEach(ca => console.log(`  ${ca.feeType}: ${ca.total}`));
    
    // Allocate the 400,000 as overpayment/credit
    const allocationResult = await client.query(
      `INSERT INTO payment_allocations
       (id, "paymentId", "schoolId", "termId", "academicCalendarId", "allocatedAmount", "feeType", "allocationReason", "isAutoAllocation", "allocatedAt")
       VALUES
       (gen_random_uuid(), $1, $2, $3, $4, 400000, 'Credit Balance', 'advance_payment', true, NOW())
       RETURNING id, "allocatedAmount", "feeType"`,
      [newPaymentId, student.schoolId, student.termId, term.academicCalendarId]
    );
    
    console.log('\n✅ Created allocation:', allocationResult.rows[0]);
    
    // Show new totals
    const totals = await client.query(
      `SELECT 
        (SELECT SUM(amount) FROM fee_payment WHERE "studentId" = $1) as total_payments,
        (SELECT SUM("allocatedAmount") FROM payment_allocations pa JOIN fee_payment fp ON pa."paymentId" = fp.id WHERE fp."studentId" = $1) as total_allocated
      `,
      [student.id]
    );
    
    console.log('\n' + '='.repeat(50));
    console.log('NEW TOTALS:');
    console.log('Total Payments:', totals.rows[0].total_payments);
    console.log('Total Allocated:', totals.rows[0].total_allocated);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

createMissingPayment();
