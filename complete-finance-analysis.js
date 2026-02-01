const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function getCompleteFinanceData() {
  try {
    const currentTermId = '413c5860-28b9-4529-9416-dad53e91a447';
    
    console.log('💰 Complete Finance Analysis for Current Term\n');
    
    // 1. Students in current term
    const studentsQuery = `
      SELECT COUNT(*) as count
      FROM student 
      WHERE "termId"::uuid = $1
    `;
    const students = await pool.query(studentsQuery, [currentTermId]);
    console.log(`👥 Students in current term: ${students.rows[0].count}`);
    
    // 2. Fee structures for current term
    const feeStructuresQuery = `
      SELECT 
        "feeType",
        amount,
        "isOptional",
        "classId"
      FROM fee_structure 
      WHERE "termId" = $1 AND "isActive" = true
      ORDER BY "feeType"
    `;
    const feeStructures = await pool.query(feeStructuresQuery, [currentTermId]);
    
    console.log(`\n📋 Fee Structures (${feeStructures.rows.length}):`);
    let totalMandatoryFees = 0;
    feeStructures.rows.forEach(fs => {
      const amount = parseInt(fs.amount);
      const classSpecific = fs.classId ? ' (class-specific)' : '';
      console.log(`  - ${fs.feeType}: MK ${amount.toLocaleString()}${fs.isOptional ? ' (Optional)' : ' (Mandatory)'}${classSpecific}`);
      if (!fs.isOptional) {
        totalMandatoryFees += amount;
      }
    });
    
    console.log(`\nTotal mandatory fees per student: MK ${totalMandatoryFees.toLocaleString()}`);
    
    // 3. Payments for current term
    const paymentsQuery = `
      SELECT 
        COUNT(*) as payment_count,
        SUM(CAST(amount AS DECIMAL)) as total_amount,
        COUNT(DISTINCT "studentId") as students_who_paid
      FROM fee_payment 
      WHERE "termId" = $1 AND status = 'completed'
    `;
    const payments = await pool.query(paymentsQuery, [currentTermId]);
    const paymentData = payments.rows[0];
    
    console.log(`\n💰 Payments:`);
    console.log(`  Total payments: ${paymentData.payment_count}`);
    console.log(`  Students who paid: ${paymentData.students_who_paid}`);
    console.log(`  Total amount paid: MK ${parseInt(paymentData.total_amount || 0).toLocaleString()}`);
    
    // 4. Calculate expected vs actual
    const studentCount = parseInt(students.rows[0].count);
    const expectedTotal = totalMandatoryFees * studentCount;
    const actualPaid = parseInt(paymentData.total_amount || 0);
    const outstanding = expectedTotal - actualPaid;
    
    console.log(`\n📊 Summary:`);
    console.log(`  Expected Total: MK ${expectedTotal.toLocaleString()}`);
    console.log(`  Actual Paid: MK ${actualPaid.toLocaleString()}`);
    console.log(`  Outstanding: MK ${outstanding.toLocaleString()}`);
    console.log(`  Payment Rate: ${expectedTotal > 0 ? ((actualPaid / expectedTotal) * 100).toFixed(1) : 0}%`);
    
    // 5. Check if the issue is that some fee structures are class-specific
    const classSpecificFees = feeStructures.rows.filter(fs => fs.classId);
    if (classSpecificFees.length > 0) {
      console.log(`\n⚠️  Warning: ${classSpecificFees.length} fee structures are class-specific`);
      console.log('   This could cause calculation inconsistencies if students are in different classes');
    }
    
    // 6. Show the exact numbers that should appear in frontend
    console.log(`\n🎯 Frontend Should Show:`);
    console.log(`  Expected Fees Amount: MK ${expectedTotal.toLocaleString()}`);
    console.log(`  Total Fees Paid: MK ${actualPaid.toLocaleString()}`);
    console.log(`  Student Fee Statuses: ${studentCount} students`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

getCompleteFinanceData();