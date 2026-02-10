const { Client } = require('pg');

async function restoreGraduatedStudents() {
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

    // Step 1: Find students to restore
    const findQuery = `
      SELECT 
        s.id,
        s."firstName",
        s."lastName",
        current_class.name as current_class,
        promoted_to.name as promoted_to_class,
        scp."createdAt"
      FROM student s
      JOIN classes current_class ON s."classId" = current_class.id
      JOIN student_class_promotion scp ON s.id = scp."studentId"
      JOIN classes promoted_to ON scp."toClassId" = promoted_to.id
      WHERE current_class."numericalName" = 4
        AND promoted_to.name = 'Graduated'
        AND scp."createdAt" > '2026-02-08'
      ORDER BY s."firstName"
    `;

    const studentsToRestore = await client.query(findQuery);
    console.log(`Found ${studentsToRestore.rows.length} students to restore:\n`);
    
    studentsToRestore.rows.forEach((student, index) => {
      console.log(`${index + 1}. ${student.firstName} ${student.lastName} - Currently in: ${student.current_class}`);
    });

    if (studentsToRestore.rows.length === 0) {
      console.log('\n✓ No students need to be restored.');
      await client.end();
      return;
    }

    // Step 2: Update students to graduated class
    console.log(`\n Updating ${studentsToRestore.rows.length} students to Graduated class...\n`);
    
    const updateQuery = `
      UPDATE student
      SET "classId" = (SELECT id FROM classes WHERE name = 'Graduated' LIMIT 1)
      WHERE id IN (
        SELECT DISTINCT s.id
        FROM student s
        JOIN classes current_class ON s."classId" = current_class.id
        JOIN student_class_promotion scp ON s.id = scp."studentId"
        JOIN classes promoted_to ON scp."toClassId" = promoted_to.id
        WHERE current_class."numericalName" = 4
          AND promoted_to.name = 'Graduated'
          AND scp."createdAt" > '2026-02-08'
      )
    `;

    const updateResult = await client.query(updateQuery);
    console.log(`✓ Updated ${updateResult.rowCount} students to Graduated class\n`);

    // Step 3: Verify the update
    console.log('Verification:\n');
    const verifyQuery = `
      SELECT 
        s."firstName",
        s."lastName",
        c.name as current_class
      FROM student s
      JOIN classes c ON s."classId" = c.id
      WHERE s.id IN (
        SELECT DISTINCT s.id
        FROM student s
        JOIN student_class_promotion scp ON s.id = scp."studentId"
        JOIN classes promoted_to ON scp."toClassId" = promoted_to.id
        WHERE promoted_to.name = 'Graduated'
          AND scp."createdAt" > '2026-02-08'
      )
      ORDER BY s."firstName"
    `;

    const verified = await client.query(verifyQuery);
    verified.rows.forEach((student, index) => {
      console.log(`${index + 1}. ${student.firstName} ${student.lastName} - Now in: ${student.current_class}`);
    });

    // Step 4: Show count by class
    console.log('\n\nClass counts:');
    const countQuery = `
      SELECT 
        c.name,
        c."numericalName",
        COUNT(s.id) as student_count
      FROM classes c
      LEFT JOIN student s ON c.id = s."classId"
      WHERE c.name IN ('Form Four', 'Graduated')
      GROUP BY c.id, c.name, c."numericalName"
      ORDER BY c."numericalName"
    `;

    const counts = await client.query(countQuery);
    counts.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.student_count} students`);
    });

    console.log('\n✅ Successfully restored students to Graduated class!');

    await client.end();
    console.log('\n✓ Database connection closed.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

restoreGraduatedStudents();
