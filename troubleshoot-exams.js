#!/usr/bin/env node

/**
 * Comprehensive troubleshooting script for exam data issues
 * This script will help identify and fix the problems with exam filtering
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function runQuery(sql) {
  try {
    const { stdout, stderr } = await execAsync(`echo "${sql}" | psql -d schomas`);
    if (stderr) console.error('Query error:', stderr);
    return stdout;
  } catch (error) {
    console.error('Execution error:', error.message);
    return null;
  }
}

async function troubleshootExams() {
  console.log('🔍 Starting Exam Data Troubleshooting...\n');

  // 1. Check exam data structure
  console.log('📋 1. EXAM DATA OVERVIEW');
  console.log('=' .repeat(50));
  
  const examOverview = await runQuery(`
    SELECT 
      COUNT(*) as total_exams,
      COUNT(DISTINCT "schoolId") as schools_with_exams,
      COUNT(CASE WHEN "schoolId" IS NULL THEN 1 END) as exams_without_school
    FROM exam;
  `);
  console.log(examOverview);

  // 2. Check teacher-exam relationships
  console.log('👨‍🏫 2. TEACHER-EXAM RELATIONSHIP ANALYSIS');
  console.log('=' .repeat(50));
  
  const teacherAnalysis = await runQuery(`
    SELECT 
      e.id as exam_id,
      e.title,
      e."teacherId" as exam_teacher_id,
      t.id as teacher_id,
      t."userId" as teacher_user_id,
      t."firstName" || ' ' || t."lastName" as teacher_name,
      CASE 
        WHEN e."teacherId" = t.id THEN 'CORRECT (teacher.id)'
        WHEN e."teacherId" = t."userId" THEN 'INCORRECT (teacher.userId)'
        ELSE 'NO MATCH'
      END as relationship_status
    FROM exam e
    LEFT JOIN teacher t ON (e."teacherId" = t.id OR e."teacherId" = t."userId")
    ORDER BY e.title;
  `);
  console.log(teacherAnalysis);

  // 3. Check school relationships
  console.log('🏫 3. SCHOOL RELATIONSHIP ANALYSIS');
  console.log('=' .repeat(50));
  
  const schoolAnalysis = await runQuery(`
    SELECT 
      e.id as exam_id,
      e.title,
      e."schoolId" as exam_school_id,
      t."schoolId" as teacher_school_id,
      c."schoolId" as class_school_id,
      co."schoolId" as course_school_id,
      CASE 
        WHEN e."schoolId" IS NOT NULL THEN 'HAS SCHOOL'
        WHEN t."schoolId" IS NOT NULL THEN 'CAN DERIVE FROM TEACHER'
        WHEN c."schoolId" IS NOT NULL THEN 'CAN DERIVE FROM CLASS'
        WHEN co."schoolId" IS NOT NULL THEN 'CAN DERIVE FROM COURSE'
        ELSE 'NO SCHOOL REFERENCE'
      END as school_status
    FROM exam e
    LEFT JOIN teacher t ON (e."teacherId" = t.id OR e."teacherId" = t."userId")
    LEFT JOIN classes c ON e."classId" = c.id
    LEFT JOIN course co ON e."courseId" = co.id
    ORDER BY e.title;
  `);
  console.log(schoolAnalysis);

  // 4. Check users and their school associations
  console.log('👥 4. USER-SCHOOL ASSOCIATIONS');
  console.log('=' .repeat(50));
  
  const userAnalysis = await runQuery(`
    SELECT 
      u.id,
      u.email,
      u.role,
      u."schoolId" as user_school_id,
      t."schoolId" as teacher_school_id,
      t."firstName" || ' ' || t."lastName" as teacher_name
    FROM "user" u
    LEFT JOIN teacher t ON u.id = t."userId"
    WHERE u.role IN ('ADMIN', 'TEACHER', 'FINANCE')
    ORDER BY u.role, u.email;
  `);
  console.log(userAnalysis);

  // 5. Suggest fixes
  console.log('🔧 5. SUGGESTED FIXES');
  console.log('=' .repeat(50));
  
  console.log(`
  Based on the analysis, here are the recommended fixes:

  A. Fix Teacher ID References:
     UPDATE exam 
     SET "teacherId" = (SELECT t.id FROM teacher t WHERE t."userId" = exam."teacherId")
     WHERE EXISTS (SELECT 1 FROM teacher t WHERE t."userId" = exam."teacherId");

  B. Fix Missing School IDs:
     UPDATE exam e
     SET "schoolId" = COALESCE(
       (SELECT t."schoolId" FROM teacher t WHERE t.id = e."teacherId"),
       (SELECT c."schoolId" FROM classes c WHERE c.id = e."classId"),
       (SELECT co."schoolId" FROM course co WHERE co.id = e."courseId")
     )
     WHERE e."schoolId" IS NULL;

  C. Verify Academic Year Relations:
     SELECT 
       e.id, 
       e.title, 
       e."academicYearId",
       ay.id as academic_year_exists
     FROM exam e
     LEFT JOIN academic_year ay ON e."academicYearId" = ay.id
     WHERE ay.id IS NULL;
  `);

  console.log('\n✅ Troubleshooting Complete!');
  console.log('📝 Check the output above and apply the suggested fixes.');
  console.log('🚀 After applying fixes, restart your application and test the API endpoints.');
}

// Run the troubleshooting
troubleshootExams().catch(console.error);
