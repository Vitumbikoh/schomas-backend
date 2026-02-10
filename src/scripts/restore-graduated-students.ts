import { DataSource } from 'typeorm';

async function restoreGraduatedStudents() {
  // Database connection
  const dataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'g1Bird fly',
    database: 'schomas',
  });

  try {
    await dataSource.initialize();
    console.log('Connected to database');

    // Step 1: Find students who were promoted to graduated class but are now in non-graduated classes
    const query = `
      SELECT DISTINCT ON (s.id)
        s.id as student_id,
        s."firstName",
        s."lastName",
        s."admissionNumber",
        c."className" as current_class,
        c.id as current_class_id,
        graduated."className" as should_be_in_class,
        graduated.id as graduated_class_id,
        scp."createdAt" as promotion_date,
        scp.id as promotion_record_id
      FROM student s
      INNER JOIN student_class_enrollment sce ON s.id = sce."studentId" AND sce."isActive" = true
      INNER JOIN class c ON sce."classId" = c.id
      INNER JOIN student_class_promotion scp ON s.id = scp."studentId"
      INNER JOIN class graduated ON scp."toClassId" = graduated.id AND graduated."isGraduated" = true
      WHERE c."isGraduated" = false
      ORDER BY s.id, scp."createdAt" DESC
    `;

    const studentsToRestore = await dataSource.query(query);
    
    console.log(`\nFound ${studentsToRestore.length} students who need to be restored to graduated class:\n`);
    
    studentsToRestore.forEach((student, index) => {
      console.log(`${index + 1}. ${student.firstName} ${student.lastName} (${student.admissionNumber})`);
      console.log(`   Currently in: ${student.current_class}`);
      console.log(`   Should be in: ${student.should_be_in_class}`);
      console.log(`   Promoted on: ${student.promotion_date}`);
      console.log('');
    });

    if (studentsToRestore.length === 0) {
      console.log('No students need to be restored.');
      await dataSource.destroy();
      return;
    }

    // Step 2: Move students back to graduated class
    console.log(`\nRestoring ${studentsToRestore.length} students to graduated class...\n`);

    for (const student of studentsToRestore) {
      // Deactivate current enrollment
      await dataSource.query(
        `UPDATE student_class_enrollment 
         SET "isActive" = false 
         WHERE "studentId" = $1 AND "classId" = $2 AND "isActive" = true`,
        [student.student_id, student.current_class_id]
      );

      // Check if graduated enrollment already exists
      const existingGraduatedEnrollment = await dataSource.query(
        `SELECT id FROM student_class_enrollment 
         WHERE "studentId" = $1 AND "classId" = $2
         LIMIT 1`,
        [student.student_id, student.graduated_class_id]
      );

      if (existingGraduatedEnrollment.length > 0) {
        // Reactivate existing graduated enrollment
        await dataSource.query(
          `UPDATE student_class_enrollment 
           SET "isActive" = true 
           WHERE "studentId" = $1 AND "classId" = $2`,
          [student.student_id, student.graduated_class_id]
        );
        console.log(`✓ Restored ${student.firstName} ${student.lastName} to ${student.should_be_in_class} (reactivated existing enrollment)`);
      } else {
        // Create new graduated enrollment
        await dataSource.query(
          `INSERT INTO student_class_enrollment ("studentId", "classId", "schoolId", "isActive", "enrolledAt")
           SELECT $1, $2, s."schoolId", true, NOW()
           FROM student s WHERE s.id = $1`,
          [student.student_id, student.graduated_class_id]
        );
        console.log(`✓ Restored ${student.firstName} ${student.lastName} to ${student.should_be_in_class} (created new enrollment)`);
      }
    }

    console.log(`\n✅ Successfully restored ${studentsToRestore.length} students to graduated class!`);

    // Step 3: Verify the fix
    console.log('\nVerifying the fix...\n');
    const verifyQuery = `
      SELECT 
        s."firstName",
        s."lastName",
        c."className",
        c."isGraduated"
      FROM student s
      INNER JOIN student_class_enrollment sce ON s.id = sce."studentId" AND sce."isActive" = true
      INNER JOIN class c ON sce."classId" = c.id
      WHERE s.id = ANY($1)
      ORDER BY s."firstName"
    `;
    
    const studentIds = studentsToRestore.map(s => s.student_id);
    const verifiedStudents = await dataSource.query(verifyQuery, [studentIds]);
    
    verifiedStudents.forEach((student, index) => {
      console.log(`${index + 1}. ${student.firstName} ${student.lastName}: ${student.className} (Graduated: ${student.isGraduated})`);
    });

    await dataSource.destroy();
    console.log('\nDatabase connection closed.');
    
  } catch (error) {
    console.error('Error:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

restoreGraduatedStudents();
