const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function testFinanceAPI() {
  try {
    console.log('Testing current term finance data...');
    
    // Check current term
    const currentTermQuery = `
      SELECT 
        t.id,
        t."termNumber", 
        ac.term,
        COUNT(s.id) as student_count
      FROM term t
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      LEFT JOIN student s ON s."termId"::uuid = t.id
      WHERE t."isCurrent" = true
      GROUP BY t.id, t."termNumber", ac.term
    `;
    const currentTerm = await pool.query(currentTermQuery);
    
    if (currentTerm.rows.length === 0) {
      console.log('❌ No current term found!');
      return;
    }
    
    const term = currentTerm.rows[0];
    console.log(`✅ Current term: Term ${term.termNumber} (${term.term}) - ${term.student_count} students`);
    
    // Test fee calculation for current term
    const feeQuery = `
      SELECT 
        s.id as student_id,
        s."firstName",
        s."lastName",
        fs.id as fee_structure_id,
        fs."tuitionFee",
        fs."boardingFee",
        fs."uniformFee",
        fs."booksAndStationaryFee",
        fs."activityFee",
        (fs."tuitionFee" + COALESCE(fs."boardingFee", 0) + COALESCE(fs."uniformFee", 0) + 
         COALESCE(fs."booksAndStationaryFee", 0) + COALESCE(fs."activityFee", 0)) as total_expected,
        COALESCE(SUM(p.amount), 0) as total_paid
      FROM student s
      LEFT JOIN fee_structure fs ON s."feeStructureId" = fs.id
      LEFT JOIN payment p ON p."studentId" = s.id AND p."termId" = s."termId"
      WHERE s."termId"::uuid = $1
      GROUP BY s.id, s."firstName", s."lastName", fs.id, fs."tuitionFee", fs."boardingFee", 
               fs."uniformFee", fs."booksAndStationaryFee", fs."activityFee"
      LIMIT 5
    `;
    const fees = await pool.query(feeQuery, [term.id]);
    
    console.log(`\n💰 Sample fee data (showing ${fees.rows.length} of ${term.student_count} students):`);
    fees.rows.forEach(student => {
      console.log(`  ${student.firstName} ${student.lastName}:`);
      console.log(`    Expected: MK ${student.total_expected?.toLocaleString() || '0'}`);
      console.log(`    Paid: MK ${student.total_paid?.toLocaleString() || '0'}`);
      console.log(`    Balance: MK ${((student.total_expected || 0) - (student.total_paid || 0)).toLocaleString()}`);
    });
    
    // Calculate totals
    const totalQuery = `
      SELECT 
        COUNT(s.id) as total_students,
        SUM(fs."tuitionFee" + COALESCE(fs."boardingFee", 0) + COALESCE(fs."uniformFee", 0) + 
            COALESCE(fs."booksAndStationaryFee", 0) + COALESCE(fs."activityFee", 0)) as total_expected,
        COALESCE(SUM(p.amount), 0) as total_paid
      FROM student s
      LEFT JOIN fee_structure fs ON s."feeStructureId" = fs.id
      LEFT JOIN payment p ON p."studentId" = s.id AND p."termId" = s."termId"
      WHERE s."termId"::uuid = $1
    `;
    const totals = await pool.query(totalQuery, [term.id]);
    
    if (totals.rows.length > 0) {
      const summary = totals.rows[0];
      console.log(`\n📊 Summary for Term ${term.termNumber} (${term.term}):`);
      console.log(`  Students: ${summary.total_students}`);
      console.log(`  Total Expected: MK ${summary.total_expected?.toLocaleString() || '0'}`);
      console.log(`  Total Paid: MK ${summary.total_paid?.toLocaleString() || '0'}`);
      console.log(`  Outstanding: MK ${((summary.total_expected || 0) - (summary.total_paid || 0)).toLocaleString()}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testFinanceAPI();