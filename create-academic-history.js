const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function createAcademicHistorySystem() {
  try {
    console.log('🏗️ Creating Academic History System\n');
    
    // Step 1: Create student_academic_history table
    console.log('📋 Step 1: Creating student_academic_history table...');
    const createHistoryTableQuery = `
      CREATE TABLE IF NOT EXISTS student_academic_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        academic_calendar_id UUID NOT NULL,
        term_id UUID NOT NULL,
        term_number INTEGER NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        class_id UUID,
        enrollment_date DATE NOT NULL,
        completion_date DATE,
        status VARCHAR(20) DEFAULT 'active', -- active, completed, withdrawn, transferred
        is_current BOOLEAN DEFAULT false,
        grade_level VARCHAR(50),
        promoted_to_next_year BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        school_id UUID,
        
        CONSTRAINT fk_student_history_student FOREIGN KEY (student_id) REFERENCES student(id),
        CONSTRAINT fk_student_history_calendar FOREIGN KEY (academic_calendar_id) REFERENCES academic_calendar(id),
        CONSTRAINT fk_student_history_term FOREIGN KEY (term_id) REFERENCES term(id)
      );
    `;
    
    try {
      await pool.query(createHistoryTableQuery);
      console.log('✅ student_academic_history table created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ student_academic_history table already exists');
      } else {
        throw error;
      }
    }
    
    // Step 2: Create indexes for performance
    console.log('\n🔍 Step 2: Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_student_history_student_id ON student_academic_history(student_id);',
      'CREATE INDEX IF NOT EXISTS idx_student_history_academic_year ON student_academic_history(academic_year);',
      'CREATE INDEX IF NOT EXISTS idx_student_history_current ON student_academic_history(is_current);',
      'CREATE INDEX IF NOT EXISTS idx_student_history_student_year ON student_academic_history(student_id, academic_year);'
    ];
    
    for (const indexQuery of indexes) {
      await pool.query(indexQuery);
    }
    console.log('✅ Indexes created');
    
    // Step 3: Populate historical data from current student table
    console.log('\n📊 Step 3: Populating historical data...');
    
    // Check what data we currently have
    const currentDataQuery = `
      SELECT 
        s.id as student_id,
        s."termId" as term_id,
        s."classId" as class_id,
        s."createdAt" as enrollment_date,
        s."schoolId" as school_id,
        t.id as term_uuid,
        t."termNumber",
        ac.id as calendar_id,
        ac.term as academic_year
      FROM student s
      LEFT JOIN term t ON s."termId"::uuid = t.id  
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE s.id IS NOT NULL
    `;
    const currentData = await pool.query(currentDataQuery);
    
    console.log(`Found ${currentData.rows.length} student records to process`);
    
    // Insert historical records for each student
    let insertedCount = 0;
    for (const student of currentData.rows) {
      const insertHistoryQuery = `
        INSERT INTO student_academic_history (
          student_id, academic_calendar_id, term_id, term_number, 
          academic_year, class_id, enrollment_date, status, 
          is_current, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING
      `;
      
      const enrollmentDate = student.enrollment_date || new Date();
      const isCurrent = student.academic_year === '2026-2027';
      
      try {
        await pool.query(insertHistoryQuery, [
          student.student_id,
          student.calendar_id,
          student.term_uuid,
          student.termNumber,
          student.academic_year,
          student.class_id,
          enrollmentDate,
          'active',
          isCurrent,
          student.school_id
        ]);
        insertedCount++;
      } catch (error) {
        console.log(`⚠️  Skipped student ${student.student_id}: ${error.message}`);
      }
    }
    
    console.log(`✅ Inserted ${insertedCount} academic history records`);
    
    // Step 4: Verify the historical data
    console.log('\n🎯 Step 4: Verification...');
    const verifyQuery = `
      SELECT 
        academic_year,
        term_number,
        COUNT(*) as student_count,
        COUNT(CASE WHEN is_current = true THEN 1 END) as current_count
      FROM student_academic_history
      GROUP BY academic_year, term_number
      ORDER BY academic_year DESC, term_number
    `;
    const verification = await pool.query(verifyQuery);
    
    console.log('📊 Academic History Summary:');
    verification.rows.forEach(row => {
      const currentFlag = row.current_count > 0 ? ' ⭐ CURRENT' : '';
      console.log(`  ${row.academic_year} Term ${row.term_number}: ${row.student_count} students${currentFlag}`);
    });
    
    console.log('\n✅ Academic History System Created Successfully!');
    console.log('\n🎓 Benefits:');
    console.log('  ✅ Historical records preserved for all academic years');
    console.log('  ✅ Can generate reports for any past academic year');
    console.log('  ✅ Student progression tracking enabled');
    console.log('  ✅ Academic transcripts support');
    console.log('  ✅ Finance reports for historical periods');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

createAcademicHistorySystem();