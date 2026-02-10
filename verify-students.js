const { Client } = require('pg');

async function verifyStudentDistribution() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'g1Bird fly',
    database: 'schomas',
  });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // Check class distribution
    console.log('=== Student Distribution by Class ===\n');
    const classDistQuery = `
      SELECT 
        c.name,
        c."numericalName",
        COUNT(s.id) as student_count
      FROM classes c
      LEFT JOIN student s ON c.id = s."classId"
      WHERE c."numericalName" IN (1, 2, 3, 4, 999)
      GROUP BY c.id, c.name, c."numericalName"
      ORDER BY c."numericalName"
    `;

    const classDist = await client.query(classDistQuery);
    classDist.rows.forEach(row => {
      console.log(`  ${row.name} (${row.numericalName}): ${row.student_count} students`);
    });

    // Check students who have promotion records to graduated
    console.log('\n\n=== Students with Graduated Promotion Records ===\n');
    const promotionCheckQuery = `
      SELECT 
        s."firstName",
        s."lastName",
        current_class.name as current_class,
        promoted_to.name as promoted_to_class,
        scp."createdAt"::date as promoted_date
      FROM student s
      JOIN classes current_class ON s."classId" = current_class.id  
      JOIN student_class_promotion scp ON s.id = scp."studentId"
      JOIN classes promoted_to ON scp."toClassId" = promoted_to.id
      WHERE promoted_to.name = 'Graduated'
      ORDER BY scp."createdAt" DESC, s."firstName"
      LIMIT 20
    `;

    const promotionCheck = await client.query(promotionCheckQuery);
    
    if (promotionCheck.rows.length > 0) {
      console.log(`Found ${promotionCheck.rows.length} students with graduation records:\n`);
      promotionCheck.rows.forEach((student, index) => {
        const status = student.current_class === 'Graduated' ? '✓' : '⚠';
        console.log(`${status} ${index + 1}. ${student.firstName} ${student.lastName}`);
        console.log(`   Currently in: ${student.current_class} | Promoted to: ${student.promoted_to_class} (${student.promoted_date})`);
      });
    } else {
      console.log('No graduation promotion records found.');
    }

    await client.end();
    console.log('\n\n✓ Database connection closed.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

verifyStudentDistribution();
