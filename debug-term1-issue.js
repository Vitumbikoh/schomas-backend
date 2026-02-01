// Debug script for Term 1 data consistency issue
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function debugTerm1Issue() {
  try {
    console.log('🔍 Debugging Term 1 data consistency issue...\n');

    // Get all terms to understand the structure
    const termsQuery = `
      SELECT 
        t.id, 
        t."termNumber", 
        p.name as period_name,
        ac.term as academic_term,
        t."startDate", 
        t."endDate",
        t."isCurrent"
      FROM term t
      LEFT JOIN period p ON t."periodId" = p.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      ORDER BY t."startDate" ASC
    `;
    const terms = await pool.query(termsQuery);
    console.log('📅 Available Terms:');
    terms.rows.forEach(term => {
      console.log(`  - ID: ${term.id}, Term: ${term.termNumber}, Period: ${term.period_name}, Academic: ${term.academic_term}, Current: ${term.isCurrent}`);
    });
    console.log('\n');

    // Get Term 1 ID (term with termNumber = 1 and isCurrent = true)
    const term1Query = `
      SELECT 
        t.id, 
        t."termNumber", 
        p.name as period_name,
        ac.term as academic_term,
        t."isCurrent"
      FROM term t
      LEFT JOIN period p ON t."periodId" = p.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE t."termNumber" = 1 AND t."isCurrent" = true
      LIMIT 1
    `;
    const term1Result = await pool.query(term1Query);
    
    if (term1Result.rows.length === 0) {
      console.log('❌ No current Term 1 found in database');
      return;
    }

    const term1 = term1Result.rows[0];
    const termId = term1.id;
    console.log(`🎯 Analyzing Current Term 1: ${term1.period_name} (${term1.academic_term}), ID: ${termId}\n`);

    // Check students for this term
    const studentsQuery = `
      SELECT id, "firstName", "lastName", "termId", "schoolId"
      FROM student 
      WHERE "termId" = $1
      ORDER BY "lastName", "firstName"
    `;
    const students = await pool.query(studentsQuery, [termId]);
    console.log(`👥 Students in Term 1: ${students.rows.length}`);
    
    if (students.rows.length > 0) {
      console.log('   Sample students:');
      students.rows.slice(0, 3).forEach(student => {
        console.log(`   - ${student.firstName} ${student.lastName} (ID: ${student.id})`);
      });
    }
    console.log('\n');

    // Check fee structures for this term
    const feeStructuresQuery = `
      SELECT "feeType", amount, "isOptional", "isActive", "schoolId"
      FROM fee_structure 
      WHERE "termId" = $1 AND "isActive" = true
      ORDER BY "feeType"
    `;
    const feeStructures = await pool.query(feeStructuresQuery, [termId]);
    console.log(`💰 Fee Structures for Term 1: ${feeStructures.rows.length}`);
    
    let totalMandatoryFees = 0;
    feeStructures.rows.forEach(fee => {
      console.log(`   - ${fee.feeType}: ${fee.amount} (${fee.isOptional ? 'Optional' : 'Mandatory'})`);
      if (!fee.isOptional) {
        totalMandatoryFees += parseFloat(fee.amount);
      }
    });
    console.log(`   Total Mandatory Fees per Student: ${totalMandatoryFees}\n`);

    // Check payments for this term
    const paymentsQuery = `
      SELECT p.id, p.amount, p."paymentDate", p.status, s."firstName", s."lastName"
      FROM fee_payment p
      LEFT JOIN student s ON p."studentId" = s.id
      WHERE p."termId" = $1 AND p.status = 'completed'
      ORDER BY p."paymentDate" DESC
    `;
    const payments = await pool.query(paymentsQuery, [termId]);
    console.log(`💳 Payments for Term 1: ${payments.rows.length}`);
    
    let totalPayments = 0;
    if (payments.rows.length > 0) {
      payments.rows.slice(0, 5).forEach(payment => {
        totalPayments += parseFloat(payment.amount);
        console.log(`   - ${payment.firstName} ${payment.lastName}: ${payment.amount} (${payment.paymentDate})`);
      });
      // Count the rest
      payments.rows.slice(5).forEach(payment => {
        totalPayments += parseFloat(payment.amount);
      });
      if (payments.rows.length > 5) {
        console.log(`   ... and ${payments.rows.length - 5} more payments`);
      }
    }
    console.log(`   Total Payments: ${totalPayments}\n`);

    // Calculate expected vs actual
    const expectedTotal = totalMandatoryFees * students.rows.length;
    console.log('📊 Summary:');
    console.log(`   Students: ${students.rows.length}`);
    console.log(`   Expected per student: ${totalMandatoryFees}`);
    console.log(`   Total Expected: ${expectedTotal}`);
    console.log(`   Total Paid: ${totalPayments}`);
    console.log(`   Outstanding: ${expectedTotal - totalPayments}\n`);

    // Check for potential issues
    console.log('🔍 Potential Issues:');
    
    // Check if there are students without termId
    const studentsWithoutTermQuery = `
      SELECT COUNT(*) as count FROM student WHERE "termId" IS NULL
    `;
    const studentsWithoutTerm = await pool.query(studentsWithoutTermQuery);
    console.log(`   - Students without termId: ${studentsWithoutTerm.rows[0].count}`);
    
    // Check if there are payments without proper term association
    const orphanPaymentsQuery = `
      SELECT COUNT(*) as count FROM fee_payment 
      WHERE "termId" = $1 AND ("studentId" IS NULL OR "studentId" NOT IN (
        SELECT id FROM student WHERE "termId" = $1
      ))
    `;
    const orphanPayments = await pool.query(orphanPaymentsQuery, [termId]);
    console.log(`   - Orphan payments (not linked to term students): ${orphanPayments.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error debugging Term 1 issue:', error);
  } finally {
    await pool.end();
  }
}

debugTerm1Issue();