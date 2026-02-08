/**
 * Script to set graduation term for all existing graduated students
 * Sets graduationTermId to Term 3 of 2024-2025 academic calendar
 * 
 * Usage: node set-graduated-students-term.js
 */

const { Client } = require('pg');
require('dotenv').config();

async function setGraduationTerms() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME || 'schomas',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Step 1: Find Term 3 of 2024-2025
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
      return;
    }

    console.log(`✅ Found ${termsResult.rows.length} Term 3(s) for 2024-2025:\n`);
    termsResult.rows.forEach(term => {
      console.log(`   • Term ID: ${term.id}`);
      console.log(`     School ID: ${term.schoolId}`);
      console.log(`     Period: ${term.startDate} to ${term.endDate}\n`);
    });

    // Step 2: Find graduated students without graduationTermId
    console.log('🔍 Finding graduated students without graduation term...\n');
    const studentsQuery = `
      SELECT 
        s.id,
        s."studentId",
        s."firstName",
        s."lastName",
        s."schoolId",
        c.name as class_name
      FROM student s
      LEFT JOIN classes c ON s."classId" = c.id
      WHERE c.name ILIKE '%graduated%'
        AND s."graduationTermId" IS NULL
      ORDER BY s."lastName", s."firstName"
    `;
    
    const studentsResult = await client.query(studentsQuery);
    
    if (studentsResult.rows.length === 0) {
      console.log('✅ All graduated students already have graduation term set!\n');
      return;
    }

    console.log(`📋 Found ${studentsResult.rows.length} graduated students to update:\n`);
    studentsResult.rows.forEach((student, index) => {
      console.log(`   ${index + 1}. ${student.firstName} ${student.lastName} (${student.studentId}) - School: ${student.schoolId}`);
    });
    console.log('');

    // Step 3: Update students with graduation term
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
    console.log(`✅ Updated ${updateResult.rowCount} students with graduation term\n`);

    // Step 4: Verify the update
    console.log('🔍 Verifying updates...\n');
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
    
    console.log(`📊 Final status of all graduated students:\n`);
    verifyResult.rows.forEach((student, index) => {
      const status = student.graduation_term_number ? '✅' : '❌';
      console.log(`   ${status} ${student.firstName} ${student.lastName} (${student.studentId})`);
      if (student.graduation_term_number) {
        console.log(`      Graduated: Term ${student.graduation_term_number} of ${student.graduation_academic_year}`);
        console.log(`      End Date: ${student.graduation_date}`);
      } else {
        console.log(`      ⚠️  No graduation term set`);
      }
      console.log('');
    });

    console.log('✅ Script completed successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

setGraduationTerms();
