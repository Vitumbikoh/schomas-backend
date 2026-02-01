// Fix multiple current terms issue
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function fixCurrentTermsIssue() {
  try {
    console.log('🔧 Fixing multiple current terms issue...\n');

    // First, set all terms to not current
    const resetQuery = `UPDATE term SET "isCurrent" = false`;
    await pool.query(resetQuery);
    console.log('✅ Reset all terms to not current');

    // Then set only the Term 1 (2022-2023) with students as current
    const setCurrentQuery = `
      UPDATE term 
      SET "isCurrent" = true 
      WHERE id = '4f1e220d-d5f0-47fa-bdf6-0cc159cb3a83'
    `;
    await pool.query(setCurrentQuery);
    console.log('✅ Set Term 1 (2022-2023) as the only current term');

    // Verify the fix
    const verifyQuery = `
      SELECT 
        t.id, 
        t."termNumber", 
        p.name as period_name,
        ac.term as academic_term,
        t."isCurrent",
        COUNT(s.id) as student_count
      FROM term t
      LEFT JOIN period p ON t."periodId" = p.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      LEFT JOIN student s ON s."termId"::uuid = t.id
      WHERE t."isCurrent" = true
      GROUP BY t.id, t."termNumber", p.name, ac.term, t."isCurrent"
    `;
    const result = await pool.query(verifyQuery);
    
    console.log('\n📅 Current Terms After Fix:');
    result.rows.forEach(term => {
      console.log(`  ✅ Term ${term.termNumber} (${term.academic_term}) - ${term.student_count} students`);
    });

    if (result.rows.length === 1) {
      console.log('\n🎉 SUCCESS: Only one term is now marked as current!');
      console.log('   This should resolve the data inconsistency issue.');
    } else {
      console.log('\n❌ Issue not fully resolved - multiple terms still current');
    }

  } catch (error) {
    console.error('❌ Error fixing current terms:', error);
  } finally {
    await pool.end();
  }
}

fixCurrentTermsIssue();