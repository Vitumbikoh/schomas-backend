const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function debugFinanceCalculations() {
  try {
    console.log('🔍 Debugging Finance Calculation Differences\n');
    
    // Get the current term
    const currentTermQuery = `
      SELECT id, "termNumber", "startDate", "endDate"
      FROM term 
      WHERE "isCurrent" = true 
      LIMIT 1
    `;
    const currentTermResult = await pool.query(currentTermQuery);
    
    if (currentTermResult.rows.length === 0) {
      console.log('❌ No current term found!');
      return;
    }
    
    const currentTerm = currentTermResult.rows[0];
    console.log(`📅 Current Term: ${currentTerm.id} (Term ${currentTerm.termNumber})`);
    console.log(`   Dates: ${currentTerm.startDate} to ${currentTerm.endDate}\n`);
    
    // Test both calculation methods that the API uses
    
    // 1. Method used by getFeeSummaryForTerm: count students, multiply by total fee per student
    console.log('🧮 Method 1 - getFeeSummaryForTerm logic:');
    
    const studentsQuery = `
      SELECT COUNT(*) as total_students
      FROM student 
      WHERE "termId"::uuid = $1
    `;
    const studentsResult = await pool.query(studentsQuery, [currentTerm.id]);
    const totalStudents = parseInt(studentsResult.rows[0].total_students);
    console.log(`   Students found: ${totalStudents}`);
    
    const feeStructuresQuery = `
      SELECT *
      FROM fee_structure 
      WHERE "termId" = $1 AND "isActive" = true
    `;
    const feeStructuresResult = await pool.query(feeStructuresQuery, [currentTerm.id]);
    console.log(`   Fee structures found: ${feeStructuresResult.rows.length}`);
    
    if (feeStructuresResult.rows.length > 0) {
      console.log('   Fee structures:');
      feeStructuresResult.rows.forEach(fs => {
        console.log(`     - ${fs.feeType}: MK ${parseInt(fs.amount).toLocaleString()} (Optional: ${fs.isOptional})`);
      });
      
      const mandatoryFeeStructures = feeStructuresResult.rows.filter(f => !f.isOptional);
      const perStudentExpected = mandatoryFeeStructures.reduce((sum, f) => sum + parseInt(f.amount), 0);
      const totalExpected = perStudentExpected * totalStudents;
      
      console.log(`   Per student expected (mandatory only): MK ${perStudentExpected.toLocaleString()}`);
      console.log(`   Total expected (${totalStudents} students): MK ${totalExpected.toLocaleString()}`);
    }
    
    // 2. Method used by listStudentFeeStatuses: find each student individually
    console.log('\n🎯 Method 2 - listStudentFeeStatuses logic:');
    
    const individualStudentsQuery = `
      SELECT 
        s.id,
        s."firstName",
        s."lastName",
        s."studentId"
      FROM student s
      WHERE s."termId"::uuid = $1
      ORDER BY s."firstName", s."lastName"
    `;
    const individualStudentsResult = await pool.query(individualStudentsQuery, [currentTerm.id]);
    console.log(`   Individual students found: ${individualStudentsResult.rows.length}`);
    
    if (individualStudentsResult.rows.length !== totalStudents) {
      console.log(`   ⚠️  MISMATCH! Method 1 found ${totalStudents}, Method 2 found ${individualStudentsResult.rows.length}`);
    } else {
      console.log('   ✅ Student counts match');
    }
    
    // Show first few students
    console.log('   Sample students:');
    individualStudentsResult.rows.slice(0, 5).forEach(student => {
      console.log(`     - ${student.firstName} ${student.lastName} (${student.studentId})`);
    });
    if (individualStudentsResult.rows.length > 5) {
      console.log(`     ... and ${individualStudentsResult.rows.length - 5} more`);
    }
    
    // Check payments
    console.log('\n💰 Payment Analysis:');
    const paymentsQuery = `
      SELECT 
        COUNT(*) as payment_count,
        SUM(CAST(amount AS DECIMAL)) as total_amount
      FROM payment 
      WHERE "termId" = $1 AND status = 'completed'
    `;
    const paymentsResult = await pool.query(paymentsQuery, [currentTerm.id]);
    const paymentData = paymentsResult.rows[0];
    
    console.log(`   Total payments: ${paymentData.payment_count}`);
    console.log(`   Total paid: MK ${parseInt(paymentData.total_amount || 0).toLocaleString()}`);
    
    // Summary
    console.log('\n📊 Summary:');
    if (feeStructuresResult.rows.length > 0) {
      const mandatoryFeeStructures = feeStructuresResult.rows.filter(f => !f.isOptional);
      const perStudentExpected = mandatoryFeeStructures.reduce((sum, f) => sum + parseInt(f.amount), 0);
      const totalExpected = perStudentExpected * totalStudents;
      const totalPaid = parseInt(paymentData.total_amount || 0);
      const outstanding = totalExpected - totalPaid;
      
      console.log(`   Expected: MK ${totalExpected.toLocaleString()}`);
      console.log(`   Paid: MK ${totalPaid.toLocaleString()}`);
      console.log(`   Outstanding: MK ${outstanding.toLocaleString()}`);
      console.log(`   Payment %: ${totalExpected > 0 ? ((totalPaid / totalExpected) * 100).toFixed(1) : 0}%`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugFinanceCalculations();