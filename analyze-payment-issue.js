const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas'
});

async function analyzePaymentIssue() {
  try {
    await client.connect();
    
    // Find Joyce Waithera
    const studentResult = await client.query(
      `SELECT id, "firstName", "lastName", "studentId", "termId", "schoolId" 
       FROM student 
       WHERE "firstName" = 'Joyce' AND "lastName" = 'Waithera'`
    );
    
    if (studentResult.rows.length === 0) {
      console.log('Student Joyce Waithera not found, using first student');
      const firstStudent = await client.query('SELECT id, "firstName", "lastName", "studentId", "termId", "schoolId" FROM student LIMIT 1');
      var student = firstStudent.rows[0];
    } else {
      var student = studentResult.rows[0];
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`STUDENT: ${student.firstName} ${student.lastName} (${student.studentId})`);
    console.log('='.repeat(70));
    
    // 1. Get ALL payments for this student
    const paymentsResult = await client.query(
      `SELECT id, amount, "paymentType", "paymentDate", "termId"
       FROM fee_payment 
       WHERE "studentId" = $1 
       ORDER BY "paymentDate" DESC`,
      [student.id]
    );
    
    console.log('\n📊 ALL PAYMENTS IN DATABASE:');
    let totalActualPayments = 0;
    paymentsResult.rows.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.amount} (${p.paymentType})`);
      totalActualPayments += parseFloat(p.amount);
    });
    console.log(`  TOTAL: ${totalActualPayments}\n`);
    
    // 2. Get all allocations
    console.log('📋 ALLOCATIONS BY PAYMENT:');
    let totalAllocated = 0;
    const allocationsByType = {};
    
    for (const payment of paymentsResult.rows) {
      const allocations = await client.query(
        `SELECT "allocatedAmount", "feeType", "allocationReason"
         FROM payment_allocations 
         WHERE "paymentId" = $1`,
        [payment.id]
      );
      
      console.log(`  Payment ${payment.amount}:`);
      if (allocations.rows.length === 0) {
        console.log(`    ⚠️  NO ALLOCATIONS`);
      } else {
        allocations.rows.forEach(alloc => {
          const amount = parseFloat(alloc.allocatedAmount);
          console.log(`    - ${alloc.allocatedAmount} → ${alloc.feeType || 'NULL'}`);
          totalAllocated += amount;
          
          const feeType = alloc.feeType || 'Unallocated';
          allocationsByType[feeType] = (allocationsByType[feeType] || 0) + amount;
        });
      }
    }
    
    console.log(`\n  TOTAL ALLOCATED: ${totalAllocated}`);
    console.log('\n📈 ALLOCATIONS BY FEE TYPE:');
    Object.entries(allocationsByType).forEach(([type, amount]) => {
      console.log(`  ${type}: ${amount}`);
    });
    
    // 3. Get fee structures for this term
    const feeStructures = await client.query(
      `SELECT "feeType", amount, "isOptional"
       FROM fee_structure 
       WHERE "termId" = $1 AND "isActive" = true`,
      [student.termId]
    );
    
    console.log('\n💰 FEE STRUCTURES (Expected):');
    let totalExpected = 0;
    feeStructures.rows.forEach(fs => {
      const amount = parseFloat(fs.amount);
      console.log(`  ${fs.feeType}: ${amount}${fs.isOptional ? ' (Optional)' : ''}`);
      if (!fs.isOptional) {
        totalExpected += amount;
      }
    });
    console.log(`  TOTAL EXPECTED: ${totalExpected}\n`);
    
    // 4. Calculate what SHOULD be displayed
    console.log('='.repeat(70));
    console.log('WHAT SHOULD BE DISPLAYED:');
    console.log('='.repeat(70));
    console.log(`Total Expected:  ${totalExpected}`);
    console.log(`Total Paid:      ${totalActualPayments} ← Should use ACTUAL payment amounts`);
    console.log(`Outstanding:     ${Math.max(0, totalExpected - totalActualPayments)}`);
    console.log(`Credit Balance:  ${Math.max(0, totalActualPayments - totalExpected)}`);
    console.log(`Payment %:       ${totalExpected > 0 ? Math.round((totalActualPayments / totalExpected) * 100) : 0}%`);
    
    // 5. Identify the problem
    console.log('\n' + '='.repeat(70));
    console.log('PROBLEM ANALYSIS:');
    console.log('='.repeat(70));
    
    // Check which allocations match fee structures
    const feeStructureTypes = feeStructures.rows.map(fs => fs.feeType);
    console.log('Fee Structure Types:', feeStructureTypes.join(', '));
    
    const matchingAllocations = {};
    const nonMatchingAllocations = {};
    
    Object.entries(allocationsByType).forEach(([type, amount]) => {
      if (feeStructureTypes.includes(type)) {
        matchingAllocations[type] = amount;
      } else {
        nonMatchingAllocations[type] = amount;
      }
    });
    
    const matchingTotal = Object.values(matchingAllocations).reduce((sum, amt) => sum + amt, 0);
    const nonMatchingTotal = Object.values(nonMatchingAllocations).reduce((sum, amt) => sum + amt, 0);
    
    console.log('\n✅ Allocations matching fee structures:', matchingTotal);
    Object.entries(matchingAllocations).forEach(([type, amt]) => {
      console.log(`   - ${type}: ${amt}`);
    });
    
    console.log('\n❌ Allocations NOT matching fee structures:', nonMatchingTotal);
    Object.entries(nonMatchingAllocations).forEach(([type, amt]) => {
      console.log(`   - ${type}: ${amt}`);
    });
    
    console.log('\n⚠️  ISSUE: If transaction history only shows allocations matching');
    console.log('   fee structures, then Total Paid will be WRONG!');
    console.log(`   Shown: ${matchingTotal}, Should be: ${totalActualPayments}`);
    console.log(`   Missing: ${totalActualPayments - matchingTotal}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

analyzePaymentIssue();
