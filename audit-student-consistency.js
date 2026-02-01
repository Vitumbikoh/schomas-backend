const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function auditAndFixStudentConsistency() {
  try {
    console.log('🔍 Auditing Student Enrollment Consistency\n');
    
    // Step 1: Find the current school term
    console.log('📅 Current School Term:');
    const currentTermQuery = `
      SELECT 
        t.id as term_id,
        t."termNumber",
        ac.term as academic_year,
        ac.id as calendar_id,
        t."isCurrent"
      FROM term t
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE t."isCurrent" = true
    `;
    const currentTerm = await pool.query(currentTermQuery);
    
    if (currentTerm.rows.length === 0) {
      console.log('❌ No current term found!');
      return;
    }
    
    if (currentTerm.rows.length > 1) {
      console.log('⚠️  Multiple current terms found - fixing this first!');
      currentTerm.rows.forEach((term, i) => {
        console.log(`  ${i+1}. ${term.academic_year} Term ${term.termNumber}`);
      });
      
      // Keep only the first one as current, set others to not current
      const keepCurrent = currentTerm.rows[0];
      await pool.query('UPDATE term SET "isCurrent" = false');
      await pool.query('UPDATE term SET "isCurrent" = true WHERE id = $1', [keepCurrent.term_id]);
      console.log(`✅ Fixed: Set ${keepCurrent.academic_year} Term ${keepCurrent.termNumber} as the only current term\n`);
    }
    
    const schoolCurrentTerm = currentTerm.rows[0];
    console.log(`✅ School Current Term: ${schoolCurrentTerm.academic_year} Term ${schoolCurrentTerm.termNumber}`);
    console.log(`   Term ID: ${schoolCurrentTerm.term_id}\n`);
    
    // Step 2: Check all students and their term assignments
    console.log('👥 Student Term Distribution:');
    const studentDistQuery = `
      SELECT 
        ac.term as academic_year,
        t."termNumber",
        t.id as term_id,
        COUNT(s.id) as student_count
      FROM student s
      LEFT JOIN term t ON s."termId"::uuid = t.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      GROUP BY ac.term, t."termNumber", t.id
      ORDER BY ac.term DESC, t."termNumber"
    `;
    const distribution = await pool.query(studentDistQuery);
    
    let studentsInWrongTerm = 0;
    let wrongTermIds = [];
    
    distribution.rows.forEach(row => {
      const isCorrectTerm = row.term_id === schoolCurrentTerm.term_id;
      const status = isCorrectTerm ? '✅ CORRECT' : '❌ WRONG TERM';
      console.log(`  ${row.academic_year} Term ${row.termNumber}: ${row.student_count} students ${status}`);
      
      if (!isCorrectTerm && row.student_count > 0) {
        studentsInWrongTerm += parseInt(row.student_count);
        wrongTermIds.push(row.term_id);
      }
    });
    
    // Step 3: Fix inconsistencies if found
    if (studentsInWrongTerm > 0) {
      console.log(`\n⚠️  INCONSISTENCY DETECTED:`);
      console.log(`   ${studentsInWrongTerm} students are NOT in the current school term!`);
      console.log(`   Moving them to: ${schoolCurrentTerm.academic_year} Term ${schoolCurrentTerm.termNumber}`);
      
      // Move all students from wrong terms to the correct current term
      console.log('\n🔄 Fixing enrollment consistency...');
      
      for (const wrongTermId of wrongTermIds) {
        const moveQuery = `
          UPDATE student 
          SET "termId" = $1
          WHERE "termId"::uuid = $2
        `;
        const moveResult = await pool.query(moveQuery, [schoolCurrentTerm.term_id, wrongTermId]);
        console.log(`✅ Moved ${moveResult.rowCount} students from term ${wrongTermId}`);
      }
      
      // Verification
      console.log('\n🎉 Verification after fix:');
      const verifyQuery = `
        SELECT 
          ac.term as academic_year,
          t."termNumber",
          COUNT(s.id) as student_count
        FROM student s
        LEFT JOIN term t ON s."termId"::uuid = t.id
        LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
        GROUP BY ac.term, t."termNumber"
        HAVING COUNT(s.id) > 0
        ORDER BY ac.term DESC, t."termNumber"
      `;
      const verification = await pool.query(verifyQuery);
      
      verification.rows.forEach(row => {
        console.log(`  ${row.academic_year} Term ${row.termNumber}: ${row.student_count} students`);
      });
      
      console.log('\n✅ CONSISTENCY RESTORED!');
      console.log(`   All students are now enrolled in: ${schoolCurrentTerm.academic_year} Term ${schoolCurrentTerm.termNumber}`);
      
    } else {
      console.log('\n✅ ALL STUDENTS ARE CORRECTLY ENROLLED');
      console.log(`   All students are in the current school term: ${schoolCurrentTerm.academic_year} Term ${schoolCurrentTerm.termNumber}`);
    }
    
    // Final summary
    const totalStudentsQuery = `SELECT COUNT(*) as total FROM student`;
    const totalStudents = await pool.query(totalStudentsQuery);
    console.log(`\n📊 Final Summary:`);
    console.log(`   Total students: ${totalStudents.rows[0].total}`);
    console.log(`   Current term: ${schoolCurrentTerm.academic_year} Term ${schoolCurrentTerm.termNumber}`);
    console.log(`   All students consistently enrolled: ✅`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

auditAndFixStudentConsistency();