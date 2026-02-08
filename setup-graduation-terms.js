/**
 * Complete setup script for graduation terms
 * 1. Adds graduationTermId column to student table
 * 2. Sets graduation term for all graduated students to Term 3 of 2024-2025
 * 
 * Usage: node setup-graduation-terms.js
 */

const { Client } = require('pg');
require('dotenv').config();

async function setupGraduationTerms() {
  const client = new Client({
    host: process.env.DB_HOST || process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.DATABASE_PORT || '5432'),
    user: process.env.DB_USERNAME || process.env.DATABASE_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD,
    database: process.env.DB_DATABASE || process.env.DATABASE_NAME || 'schomas',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Step 1: Add graduationTermId column if it doesn't exist
    console.log('🔧 Adding graduationTermId column to student table...\n');
    await client.query(`
      ALTER TABLE student 
      ADD COLUMN IF NOT EXISTS "graduationTermId" UUID NULL;
    `);
    console.log('✅ Column added (or already exists)\n');

    // Step 2: Add foreign key constraint
    console.log('🔧 Adding foreign key constraint...\n');
    try {
      await client.query(`
        ALTER TABLE student 
        DROP CONSTRAINT IF EXISTS fk_student_graduation_term;
        
        ALTER TABLE student 
        ADD CONSTRAINT fk_student_graduation_term 
        FOREIGN KEY ("graduationTermId") REFERENCES term(id) 
        ON DELETE SET NULL;
      `);
      console.log('✅ Constraint added\n');
    } catch (error) {
      console.log('⚠️  Constraint may already exist (this is OK)\n');
    }

    // Step 3: Add index
    console.log('🔧 Adding index for performance...\n');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_student_graduation_term 
      ON student("graduationTermId");
    `);
    console.log('✅ Index created\n');

    // Step 4: Find Term 3 of 2024-2025
    console.log('🔍 Finding Term 3 of 2024-2025 academic calendar...\n');
    const termQuery = `
      SELECT 
        t.id,
        t."termNumber",
        t."schoolId",
        ac.term as academic_year,
        t."startDate",
        t."endDate"
      FROM term t
      JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE ac.term = '2024-2025' 
        AND t."termNumber" = 3
    `;
    
    const termsResult = await client.query(termQuery);
    
    if (termsResult.rows.length === 0) {
      console.log('❌ No Term 3 found in 2024-2025 academic calendar');
      console.log('   Please verify the academic calendar and term exist in your database.\n');
      
      // Show available academic calendars and terms
      console.log('📊 Available academic calendars and terms:\n');
      const availableQuery = `
        SELECT DISTINCT 
          ac.term as academic_year,
          t."termNumber",
          COUNT(t.id) as term_count
        FROM term t
        JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
        GROUP BY ac.term, t."termNumber"
        ORDER BY ac.term DESC, t."termNumber"
      `;
      const available = await client.query(availableQuery);
      available.rows.forEach(row => {
        console.log(`   ${row.academic_year} - Term ${row.termNumber} (${row.term_count} school(s))`);
      });
      console.log('');
      return;
    }

    console.log(`✅ Found ${termsResult.rows.length} Term 3(s) for 2024-2025:\n`);
    termsResult.rows.forEach(term => {
      console.log(`   • Term ID: ${term.id}`);
      console.log(`     School ID: ${term.schoolId}`);
      console.log(`     Period: ${term.startDate.toISOString().split('T')[0]} to ${term.endDate.toISOString().split('T')[0]}\n`);
    });

    // Step 5: Find graduated students
    console.log('🔍 Finding graduated students...\n');
    const studentsQuery = `
      SELECT 
        s.id,
        s."studentId",
        s."firstName",
        s."lastName",
        s."schoolId",
        s."graduationTermId",
        c.name as class_name
      FROM student s
      LEFT JOIN classes c ON s."classId" = c.id
      WHERE c.name ILIKE '%graduated%'
      ORDER BY s."lastName", s."firstName"
    `;
    
    const studentsResult = await client.query(studentsQuery);
    
    if (studentsResult.rows.length === 0) {
      console.log('⚠️  No graduated students found.\n');
      return;
    }

    const needsUpdate = studentsResult.rows.filter(s => !s.graduationTermId);
    console.log(`📋 Found ${studentsResult.rows.length} graduated students:`);
    console.log(`   - ${needsUpdate.length} need graduation term set`);
    console.log(`   - ${studentsResult.rows.length - needsUpdate.length} already have graduation term\n`);

    if (needsUpdate.length > 0) {
      console.log('Students to update:\n');
      needsUpdate.forEach((student, index) => {
        console.log(`   ${index + 1}. ${student.firstName} ${student.lastName} (${student.studentId})`);
      });
      console.log('');

      // Step 6: Update students
      console.log('📝 Setting graduation term for these students...\n');
      const updateQuery = `
        UPDATE student s
        SET "graduationTermId" = (
          SELECT t.id 
          FROM term t 
          JOIN academic_calendar ac ON t."academicCalendarId" = ac.id 
          WHERE ac.term = '2024-2025' 
            AND t."termNumber" = 3 
            AND t."schoolId" = s."schoolId"
          LIMIT 1
        )
        WHERE s."classId" IN (
          SELECT id FROM classes WHERE name ILIKE '%graduated%'
        )
        AND s."graduationTermId" IS NULL
      `;
      
      const updateResult = await client.query(updateQuery);
      console.log(`✅ Updated ${updateResult.rowCount} students\n`);
    }

    // Step 7: Verify
    console.log('🔍 Verifying all graduated students...\n');
    const verifyQuery = `
      SELECT 
        s.id,
        s."studentId",
        s."firstName",
        s."lastName",
        c.name as class_name,
        gt."termNumber" as graduation_term_number,
        ac.term as graduation_academic_year,
        gt."endDate" as graduation_date
      FROM student s
      LEFT JOIN classes c ON s."classId" = c.id
      LEFT JOIN term gt ON s."graduationTermId" = gt.id
      LEFT JOIN academic_calendar ac ON gt."academicCalendarId" = ac.id
      WHERE c.name ILIKE '%graduated%'
      ORDER BY s."lastName", s."firstName"
    `;
    
    const verifyResult = await client.query(verifyQuery);
    
    console.log(`✅ Final status of all graduated students:\n`);
    verifyResult.rows.forEach((student, index) => {
      const status = student.graduation_term_number ? '✅' : '❌';
      console.log(`   ${status} ${student.firstName} ${student.lastName} (${student.studentId})`);
      if (student.graduation_term_number) {
        console.log(`      Graduated: Term ${student.graduation_term_number} of ${student.graduation_academic_year}`);
        console.log(`      End Date: ${student.graduation_date.toISOString().split('T')[0]}`);
      } else {
        console.log(`      ⚠️  No graduation term set (check if term exists for this school)`);
      }
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('✅ Setup completed successfully!\n');
    console.log('Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Refresh the Graduated Outstanding page');
    console.log('3. Balances should now only include terms up to 2024-2025 Term 3\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

setupGraduationTerms();
