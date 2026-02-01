// Deep analysis of Term 1 fee calculation consistency
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'g1Bird fly',
  database: 'schomas',
});

async function analyzeExpectedFeesCalculation() {
  try {
    console.log('🧮 Deep Analysis of Term 1 Fee Calculations...\n');

    const termId = '4f1e220d-d5f0-47fa-bdf6-0cc159cb3a83';

    // Get all fee structures with details
    const feeStructuresQuery = `
      SELECT 
        fs."feeType", 
        fs.amount, 
        fs."isOptional", 
        fs."isActive", 
        fs."schoolId",
        fs."classId",
        c.name as class_name
      FROM fee_structure fs
      LEFT JOIN classes c ON fs."classId" = c.id
      WHERE fs."termId" = $1 AND fs."isActive" = true
      ORDER BY fs."feeType", fs."classId"
    `;
    const feeStructures = await pool.query(feeStructuresQuery, [termId]);
    
    console.log('💰 Fee Structures Detail:');
    let totalMandatory = 0;
    feeStructures.rows.forEach(fee => {
      const classInfo = fee.classId ? ` (Class: ${fee.class_name || fee.classId})` : ' (All Classes)';
      const optionalText = fee.isOptional ? ' [OPTIONAL]' : ' [MANDATORY]';
      console.log(`   ${fee.feeType}: ${fee.amount}${classInfo}${optionalText}`);
      if (!fee.isOptional) {
        totalMandatory += parseFloat(fee.amount);
      }
    });
    console.log(`   Total Mandatory: ${totalMandatory}\n`);

    // Get students by class
    const studentsQuery = `
      SELECT 
        s.id, 
        s."firstName", 
        s."lastName", 
        s."classId",
        c.name as class_name
      FROM student s
      LEFT JOIN classes c ON s."classId" = c.id
      WHERE s."termId" = $1
      ORDER BY c.name, s."lastName"
    `;
    const students = await pool.query(studentsQuery, [termId]);
    
    console.log(`👥 Students by Class (${students.rows.length} total):`);
    const studentsByClass = {};
    students.rows.forEach(student => {
      const className = student.class_name || 'No Class';
      if (!studentsByClass[className]) {
        studentsByClass[className] = [];
      }
      studentsByClass[className].push(student);
    });
    
    Object.entries(studentsByClass).forEach(([className, classStudents]) => {
      console.log(`   ${className}: ${classStudents.length} students`);
    });
    console.log('');

    // Calculate expected fees per class
    console.log('🧮 Expected Fees Calculation by Class:');
    let totalExpectedFees = 0;
    
    Object.entries(studentsByClass).forEach(([className, classStudents]) => {
      console.log(`\n   ${className} (${classStudents.length} students):`);
      
      // Get applicable fees for this class
      const classId = classStudents[0]?.classId;
      const applicableFees = feeStructures.rows.filter(fee => 
        !fee.isOptional && (!fee.classId || fee.classId === classId)
      );
      
      let perStudentTotal = 0;
      applicableFees.forEach(fee => {
        console.log(`     - ${fee.feeType}: ${fee.amount}`);
        perStudentTotal += parseFloat(fee.amount);
      });
      
      const classTotal = perStudentTotal * classStudents.length;
      console.log(`     Per Student: ${perStudentTotal}`);
      console.log(`     Class Total: ${classTotal}`);
      
      totalExpectedFees += classTotal;
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total Expected Fees: ${totalExpectedFees}`);
    console.log(`   Students: ${students.rows.length}`);
    console.log(`   Average per Student: ${totalExpectedFees / students.rows.length}`);

    // Check what the API would calculate
    console.log(`\n🔍 API Calculation Logic Check:`);
    console.log(`   Simple Total (all fees × all students): ${totalMandatory} × ${students.rows.length} = ${totalMandatory * students.rows.length}`);
    console.log(`   Class-aware Total: ${totalExpectedFees}`);
    
    if (totalMandatory * students.rows.length !== totalExpectedFees) {
      console.log(`   ⚠️  DIFFERENCE: ${Math.abs((totalMandatory * students.rows.length) - totalExpectedFees)}`);
      console.log(`   This suggests class-specific fee structures are affecting the calculation.`);
    }

  } catch (error) {
    console.error('❌ Error analyzing expected fees:', error);
  } finally {
    await pool.end();
  }
}

analyzeExpectedFeesCalculation();