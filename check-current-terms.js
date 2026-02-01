// Check multiple current terms issue
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function checkCurrentTermsIssue() {
  try {
    console.log('🔍 Checking multiple current terms issue...\n');

    // Get all current terms
    const currentTermsQuery = `
      SELECT 
        t.id, 
        t."termNumber", 
        p.name as period_name,
        ac.term as academic_term,
        t."isCurrent",
        COUNT(s.id) as student_count,
        t."startDate",
        t."endDate"
      FROM term t
      LEFT JOIN period p ON t."periodId" = p.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      LEFT JOIN student s ON s."termId"::uuid = t.id
      WHERE t."isCurrent" = true
      GROUP BY t.id, t."termNumber", p.name, ac.term, t."isCurrent", t."startDate", t."endDate"
      ORDER BY t."startDate"
    `;
    const currentTerms = await pool.query(currentTermsQuery);
    console.log(`📅 Current Terms (${currentTerms.rows.length}):`);
    
    currentTerms.rows.forEach(term => {
      console.log(`  - Term ${term.termNumber} (${term.academic_term})`);
      console.log(`    ID: ${term.id}`);
      console.log(`    Students: ${term.student_count}`);
      console.log(`    Dates: ${term.startDate} to ${term.endDate}`);
      console.log('');
    });

    if (currentTerms.rows.length > 1) {
      console.log('❌ PROBLEM: Multiple terms marked as current!');
      console.log('   This explains the data inconsistency.\n');
      
      // Show which term has most students (likely the active one)
      const mostStudents = currentTerms.rows.reduce((max, term) => 
        parseInt(term.student_count) > parseInt(max.student_count) ? term : max
      );
      console.log(`💡 Term with most students: Term ${mostStudents.termNumber} (${mostStudents.academic_term}) - ${mostStudents.student_count} students`);
      console.log(`   This should probably be the only current term.`);
    }

  } catch (error) {
    console.error('❌ Error checking current terms:', error);
  } finally {
    await pool.end();
  }
}

checkCurrentTermsIssue();