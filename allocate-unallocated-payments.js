const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas'
});

async function allocateUnallocatedPayments() {
  try {
    await client.connect();
    console.log('🔍 Finding all unallocated payments...\n');
    
    // Find all payments without allocations
    const unallocatedPayments = await client.query(`
      SELECT 
        fp.id as payment_id,
        fp.amount,
        fp."paymentType",
        fp."studentId",
        fp."termId",
        fp."schoolId",
        s."firstName",
        s."lastName",
        t."academicCalendarId"
      FROM fee_payment fp
      LEFT JOIN payment_allocations pa ON fp.id = pa."paymentId"
      JOIN student s ON fp."studentId" = s.id
      JOIN term t ON fp."termId" = t.id
      WHERE pa.id IS NULL
      AND fp.status = 'completed'
      ORDER BY fp."paymentDate"
    `);
    
    console.log(`Found ${unallocatedPayments.rows.length} unallocated payments\n`);
    
    if (unallocatedPayments.rows.length === 0) {
      console.log('✅ All payments are already allocated!');
      return;
    }
    
    let allocatedCount = 0;
    let totalAllocated = 0;
    
    for (const payment of unallocatedPayments.rows) {
      console.log(`\nProcessing payment for ${payment.firstName} ${payment.lastName}:`);
      console.log(`  Amount: ${payment.amount}, Type: ${payment.paymentType}`);
      
      // Get fee structures for this term
      const feeStructures = await client.query(
        `SELECT "feeType", amount, "isOptional"
         FROM fee_structure 
         WHERE "termId" = $1 
         AND "isActive" = true 
         AND "isOptional" = false
         ORDER BY amount DESC`,
        [payment.termId]
      );
      
      if (feeStructures.rows.length === 0) {
        console.log('  ⚠️  No fee structures found for this term');
        continue;
      }
      
      console.log('  Fee structures:');
      feeStructures.rows.forEach(fs => {
        console.log(`    - ${fs.feeType}: ${fs.amount}`);
      });
      
      // Get existing allocations for this student in this term
      const existingAllocations = await client.query(
        `SELECT pa."feeType", SUM(pa."allocatedAmount") as total
         FROM payment_allocations pa
         JOIN fee_payment fp ON pa."paymentId" = fp.id
         WHERE fp."studentId" = $1 
         AND pa."termId" = $2
         GROUP BY pa."feeType"`,
        [payment.studentId, payment.termId]
      );
      
      const allocatedByType = {};
      existingAllocations.rows.forEach(row => {
        allocatedByType[row.feeType] = parseFloat(row.total);
      });
      
      console.log('  Already allocated:');
      if (Object.keys(allocatedByType).length === 0) {
        console.log('    (none)');
      } else {
        Object.entries(allocatedByType).forEach(([type, amt]) => {
          console.log(`    - ${type}: ${amt}`);
        });
      }
      
      // Allocate the payment
      let remainingAmount = parseFloat(payment.amount);
      const allocations = [];
      
      // First, allocate to fee structures that haven't been fully paid
      for (const fs of feeStructures.rows) {
        const feeAmount = parseFloat(fs.amount);
        const alreadyAllocated = allocatedByType[fs.feeType] || 0;
        const stillOwed = feeAmount - alreadyAllocated;
        
        if (stillOwed > 0 && remainingAmount > 0) {
          const toAllocate = Math.min(stillOwed, remainingAmount);
          allocations.push({
            feeType: fs.feeType,
            amount: toAllocate,
            reason: 'term_fees'
          });
          remainingAmount -= toAllocate;
        }
      }
      
      // If there's still remaining amount, it's an overpayment
      if (remainingAmount > 0) {
        allocations.push({
          feeType: 'Credit Balance',
          amount: remainingAmount,
          reason: 'advance_payment'
        });
      }
      
      // Insert allocations
      console.log('  Creating allocations:');
      for (const alloc of allocations) {
        await client.query(
          `INSERT INTO payment_allocations
           (id, "paymentId", "schoolId", "termId", "academicCalendarId", "allocatedAmount", "feeType", "allocationReason", "isAutoAllocation", "allocatedAt")
           VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true, NOW())`,
          [
            payment.payment_id,
            payment.schoolId,
            payment.termId,
            payment.academicCalendarId,
            alloc.amount,
            alloc.feeType,
            alloc.reason
          ]
        );
        console.log(`    ✅ ${alloc.amount} → ${alloc.feeType}`);
        totalAllocated += alloc.amount;
      }
      
      allocatedCount++;
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70));
    console.log(`Payments allocated: ${allocatedCount}`);
    console.log(`Total amount allocated: ${totalAllocated}`);
    console.log('✅ All unallocated payments have been processed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

allocateUnallocatedPayments();
