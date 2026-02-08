// Quick check of student enrollment terms and fee calculation
const { Client } = require('pg');

async function checkStudent(studentId) {
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

    // Get student info
    const studentRes = await client.query(`
      SELECT 
        s."firstName", 
        s."lastName", 
        s."studentId", 
        s."enrollmentTermId",
        s."graduationTermId",
        s."schoolId",
        c."name" as class_name,
        et."termNumber" as enrollment_term,
        ac.term as enrollment_academic_year,
        et."startDate" as enrollment_start
      FROM student s
      LEFT JOIN classes c ON s."classId" = c.id
      LEFT JOIN term et ON s."enrollmentTermId" = et.id
      LEFT JOIN academic_calendar ac ON et."academicCalendarId" = ac.id
      WHERE s."studentId" = $1
    `, [studentId]);

    if (studentRes.rows.length === 0) {
      console.log('❌ Student not found');
      return;
    }

    const student = studentRes.rows[0];
    console.log('👤 STUDENT INFO:');
    console.log(`   Name: ${student.firstName} ${student.lastName}`);
    console.log(`   Student ID: ${student.studentId}`);
    console.log(`   Class: ${student.class_name}`);
    console.log(`   Enrollment Term ID: ${student.enrollmentTermId || 'NOT SET ❌'}`);
    
    if (student.enrollmentTermId) {
      console.log(`   Enrolled: Term ${student.enrollment_term} (${student.enrollment_academic_year})`);
      console.log(`   Enrollment Start: ${student.enrollment_start}`);
    }
    console.log('');

    // Get all terms for the school
    const termsRes = await client.query(`
      SELECT 
        t.id,
        t."termNumber",
        t."startDate",
        t."endDate",
        ac.term as academic_year,
        ac."isActive",
        t."isCurrent"
      FROM term t
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE t."schoolId" = (SELECT "schoolId" FROM student WHERE "studentId" = $1)
      ORDER BY t."startDate" ASC
    `, [studentId]);

    console.log('📅 ALL TERMS IN SCHOOL:');
    let termsFromEnrollment = [];
    termsRes.rows.forEach((term, idx) => {
      const marker = term.isCurrent ? '← CURRENT' : term.isActive ? '' : '(Old Calendar)';
      console.log(`   ${idx + 1}. Term ${term.termNumber} (${term.academic_year}): ${term.startDate} to ${term.endDate} ${marker}`);
      
      if (student.enrollmentTermId) {
        const termStart = new Date(term.startDate);
        const enrollStart = new Date(student.enrollment_start);
        if (termStart >= enrollStart) {
          termsFromEnrollment.push(term);
        }
      }
    });
    console.log('');

    if (student.enrollmentTermId) {
      console.log(`💰 TERMS STUDENT SHOULD BE CHARGED FOR (from enrollment onwards):`);
      console.log(`   Total: ${termsFromEnrollment.length} terms`);
      termsFromEnrollment.forEach((term, idx) => {
        console.log(`   ${idx + 1}. Term ${term.termNumber} (${term.academic_year})`);
      });
      console.log('');
    } else {
      console.log('⚠️  WARNING: No enrollment term set - system will use active calendar only!\n');
    }

    // Get fee structures to calculate expected fees
    const feeRes = await client.query(`
      SELECT 
        t."termNumber",
        ac.term as academic_year,
        SUM(CASE WHEN fs."isOptional" = false THEN fs.amount ELSE 0 END) as mandatory_fees,
        SUM(CASE WHEN fs."isOptional" = true THEN fs.amount ELSE 0 END) as optional_fees
      FROM term t
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      LEFT JOIN fee_structure fs ON fs."termId" = t.id AND fs."isActive" = true
      WHERE t."schoolId" = (SELECT "schoolId" FROM student WHERE "studentId" = $1)
      GROUP BY t.id, t."termNumber", ac.term, t."startDate"
      ORDER BY t."startDate" ASC
    `, [studentId]);

    console.log('💵 EXPECTED FEES BY TERM:');
    let totalExpectedIfAllTerms = 0;
    let totalExpectedFromEnrollment = 0;
    
    feeRes.rows.forEach(fee => {
      const mandatory = parseFloat(fee.mandatory_fees || 0);
      const optional = parseFloat(fee.optional_fees || 0);
      const total = mandatory + optional;
      totalExpectedIfAllTerms += total;
      
      // Check if this term is from enrollment onwards
      const isFromEnrollment = termsFromEnrollment.some(t => 
        t.termNumber === fee.termNumber && t.academic_year === fee.academic_year
      );
      
      if (isFromEnrollment) {
        totalExpectedFromEnrollment += total;
      }
      
      console.log(`   Term ${fee.termNumber} (${fee.academic_year}): MK ${total.toLocaleString()} ${isFromEnrollment ? '✓ Should charge' : '✗ Before enrollment'}`);
    });
    
    console.log('');
    console.log('📊 SUMMARY:');
    console.log(`   If charging ALL terms: MK ${totalExpectedIfAllTerms.toLocaleString()}`);
    console.log(`   If charging from enrollment: MK ${totalExpectedFromEnrollment.toLocaleString()} ✓ CORRECT`);
    console.log('');

    // Get actual payments
    const paymentsRes = await client.query(`
      SELECT 
        SUM(fp.amount) as total_paid
      FROM fee_payment fp
      WHERE fp."studentId" = (SELECT id FROM student WHERE "studentId" = $1)
        AND fp.status = 'completed'
    `, [studentId]);

    const totalPaid = parseFloat(paymentsRes.rows[0]?.total_paid || 0);
    console.log(`💳 ACTUAL PAYMENTS: MK ${totalPaid.toLocaleString()}`);
    console.log(`🔴 OUTSTANDING: MK ${(totalExpectedFromEnrollment - totalPaid).toLocaleString()}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

// Check the student
const studentId = process.argv[2] || '260014'; // Default to James Koech
console.log(`🔍 Checking student ${studentId}...\n`);
checkStudent(studentId);
