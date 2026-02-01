const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function findStudents() {
  try {
    console.log('Finding all students by term...');
    
    const studentsQuery = `SELECT 
        t.id as term_id,
        t."termNumber",
        ac.term,
        t."isCurrent",
        COUNT(s.id) as student_count
      FROM term t
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      LEFT JOIN student s ON s."termId"::uuid = t.id
      GROUP BY t.id, t."termNumber", ac.term, t."isCurrent"
      HAVING COUNT(s.id) > 0
      ORDER BY COUNT(s.id) DESC, ac.term, t."termNumber"`;
    const students = await pool.query(studentsQuery);
    
    console.log('\nTerms with students:');
    students.rows.forEach((term, index) => {
      console.log(`  ${index + 1}. Term ${term.termNumber} (${term.term}) - ${term.student_count} students - ${term.isCurrent ? 'CURRENT' : 'not current'}`);
    });
    
    if (students.rows.length > 0) {
      const maxStudentTerm = students.rows[0];
      console.log(`\nTerm with most students: Term ${maxStudentTerm.termNumber} (${maxStudentTerm.term}) - ${maxStudentTerm.student_count} students`);
      
      if (!maxStudentTerm.isCurrent) {
        console.log('Setting this as current term...');
        await pool.query('UPDATE term SET "isCurrent" = false');
        await pool.query('UPDATE term SET "isCurrent" = true WHERE id = $1', [maxStudentTerm.term_id]);
        console.log('✅ Current term updated!');
      } else {
        console.log('✅ This term is already current');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

findStudents();