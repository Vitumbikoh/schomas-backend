/**
 * Quick debug script to check Grace Wanjiru's data
 * Run: node debug-grace-credit.js
 */

const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas'
});

async function debug() {
  try {
    await client.connect();
    console.log('🔍 Debugging Grace Wanjiru Credit Application Issue\n');
    console.log('='.repeat(70));

    // 1. Get student details
    console.log('\n1️⃣ Student Information:');
    console.log('-'.repeat(70));
    const studentResult = await client.query(`
      SELECT 
        s.id,
        s."studentId",
        s."firstName",
        s."lastName",
        s."classId",
        c.name as class_name,
        s."schoolId"
      FROM student s
      LEFT JOIN classes c ON s."classId" = c.id
      WHERE s."studentId" = '260002'
    `);
    
    if (studentResult.rows.length === 0) {
      console.log('❌ Student not found with ID 260002');
      return;
    }
    
    const student = studentResult.rows[0];
    console.log(`Student UUID: ${student.id}`);
    console.log(`Name: ${student.firstName} ${student.lastName}`);
    console.log(`Student ID: ${student.studentId}`);
    console.log(`Class: ${student.class_name} (${student.classId})`);
    console.log(`School ID: ${student.schoolId}`);

    // 2. Get credit balance
    console.log('\n2️⃣ Credit Balance:');
    console.log('-'.repeat(70));
    const creditResult = await client.query(`
      SELECT 
        cl.id,
        cl.amount,
        cl."remainingAmount",
        cl.status
      FROM credit_ledger cl
      WHERE cl."studentId" = $1
      AND cl.status = 'active'
    `, [student.id]);
    
    if (creditResult.rows.length === 0) {
      console.log('❌ No active credit balance found');
    } else {
      creditResult.rows.forEach(credit => {
        console.log(`Credit ID: ${credit.id}`);
        console.log(`Original: MK ${Number(credit.amount).toLocaleString()}`);
        console.log(`Remaining: MK ${Number(credit.remainingAmount).toLocaleString()}`);
        console.log(`Status: ${credit.status}`);
      });
    }

    // 3. Get all terms
    console.log('\n3️⃣ All Terms for School:');
    console.log('-'.repeat(70));
    const termsResult = await client.query(`
      SELECT 
        t.id,
        t."termNumber",
        t."startDate",
        t."endDate",
        t."isCurrent",
        ac.term as academic_year
      FROM term t
      JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE t."schoolId" = $1
      ORDER BY t."startDate"
    `, [student.schoolId]);
    
    console.log(`Total terms found: ${termsResult.rows.length}\n`);
    termsResult.rows.forEach(term => {
      console.log(`Term ${term.termNumber} (${term.academic_year}):`);
      console.log(`  ID: ${term.id}`);
      console.log(`  Dates: ${term.startDate} to ${term.endDate}`);
      console.log(`  Is Current: ${term.isCurrent}`);
    });

    // 4. Calculate outstanding per term
    console.log('\n4️⃣ Outstanding Calculation per Term:');
    console.log('-'.repeat(70));
    
    for (const term of termsResult.rows) {
      console.log(`\n📅 Term ${term.termNumber} (${term.academic_year}) ${term.isCurrent ? '[CURRENT]' : '[PAST]'}:`);
      
      // Get fee structures
      const feeStructuresResult = await client.query(`
        SELECT 
          fs."feeType",
          fs.amount,
          fs."isOptional",
          fs."classId",
          c.name as class_name
        FROM fee_structure fs
        LEFT JOIN classes c ON fs."classId" = c.id
        WHERE fs."termId" = $1
        AND fs."isActive" = true
        AND fs."schoolId" = $2
        ORDER BY fs."feeType"
      `, [term.id, student.schoolId]);
      
      console.log(`  Fee Structures (${feeStructuresResult.rows.length}):`);
      
      let expectedMandatory = 0;
      let expectedOptional = 0;
      
      feeStructuresResult.rows.forEach(fs => {
        const applies = !fs.classId || fs.classId === student.classId;
        const included = !fs.isOptional && applies;
        
        if (included) {
          expectedMandatory += Number(fs.amount);
        }
        if (fs.isOptional && applies) {
          expectedOptional += Number(fs.amount);
        }
        
        console.log(`    - ${fs.feeType}: MK ${Number(fs.amount).toLocaleString()} ${fs.isOptional ? '[OPTIONAL]' : '[MANDATORY]'} ${applies ? '✓ Applies' : '✗ Other class'}`);
      });
      
      // Get payments
      const paymentsResult = await client.query(`
        SELECT 
          fp.amount,
          fp."paymentDate",
          fp."paymentType",
          fp.status
        FROM fee_payment fp
        WHERE fp."termId" = $1
        AND fp."studentId" = $2
        AND fp.status = 'completed'
        ORDER BY fp."paymentDate"
      `, [term.id, student.id]);
      
      const totalPaid = paymentsResult.rows.reduce((sum, p) => sum + Number(p.amount), 0);
      const outstanding = Math.max(0, expectedMandatory - totalPaid);
      
      console.log(`\n  Summary:`);
      console.log(`    Expected (Mandatory): MK ${expectedMandatory.toLocaleString()}`);
      console.log(`    Expected (Optional):  MK ${expectedOptional.toLocaleString()}`);
      console.log(`    Total Paid:           MK ${totalPaid.toLocaleString()}`);
      console.log(`    Outstanding:          MK ${outstanding.toLocaleString()}`);
      console.log(`    Payments:             ${paymentsResult.rows.length}`);
      
      if (paymentsResult.rows.length > 0) {
        console.log(`\n  Payment Details:`);
        paymentsResult.rows.forEach(p => {
          console.log(`    - ${p.paymentDate}: MK ${Number(p.amount).toLocaleString()} (${p.paymentType})`);
        });
      }
    }

    // 5. Summary
    console.log('\n' + '='.repeat(70));
    console.log('📋 SUMMARY:');
    console.log('='.repeat(70));
    
    const currentTerms = termsResult.rows.filter(t => t.isCurrent);
    const pastTerms = termsResult.rows.filter(t => !t.isCurrent);
    
    console.log(`Total Terms: ${termsResult.rows.length}`);
    console.log(`Current Terms: ${currentTerms.length} (${currentTerms.map(t => `Term ${t.termNumber}`).join(', ') || 'None'})`);
    console.log(`Past Terms: ${pastTerms.length} (${pastTerms.map(t => `Term ${t.termNumber}`).join(', ') || 'None'})`);
    
    if (currentTerms.length === 0) {
      console.log('\n⚠️  WARNING: No current term found! This might be the issue.');
    }
    if (currentTerms.length > 1) {
      console.log('\n⚠️  WARNING: Multiple current terms found! Only one term should have isCurrent=true');
    }
    if (pastTerms.length === 0) {
      console.log('\n⚠️  WARNING: No past terms found! The system needs past terms to apply credit to.');
    }
    
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

debug();
