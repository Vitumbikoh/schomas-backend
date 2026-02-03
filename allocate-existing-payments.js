// Script to allocate existing payments to proper fee types
// This creates payment_allocations records for payments that don't have them

const { Client } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'g1Bird fly',
  database: process.env.DB_DATABASE || 'schomas',
};

async function allocatePaymentsToFeeTypes() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get all students with payments
    const studentsQuery = `
      SELECT DISTINCT 
        fp."studentId",
        fp."termId",
        fp."schoolId",
        t."academicCalendarId",
        t."termNumber"
      FROM fee_payment fp
      LEFT JOIN term t ON fp."termId" = t.id
      WHERE fp.status = 'completed'
      ORDER BY fp."studentId", t."termNumber"
    `;
    
    const students = await client.query(studentsQuery);
    console.log(`Found ${students.rows.length} student-term combinations\n`);

    for (const studentTerm of students.rows) {
      const { studentId, termId, schoolId, academicCalendarId } = studentTerm;
      
      console.log(`Processing student ${studentId}, term ${termId}...`);

      // Get fee structures for this term
      const feeStructures = await client.query(`
        SELECT "feeType", amount, "isOptional"
        FROM fee_structure
        WHERE "termId" = $1 AND "schoolId" = $2
        ORDER BY "isOptional" ASC, "feeType" ASC
      `, [termId, schoolId]);

      if (feeStructures.rows.length === 0) {
        console.log('  ⚠️  No fee structures found, skipping\n');
        continue;
      }

      // Get payments for this student-term
      const payments = await client.query(`
        SELECT id, amount, "paymentDate", "paymentType"
        FROM fee_payment
        WHERE "studentId" = $1 AND "termId" = $2 AND status = 'completed'
        ORDER BY "paymentDate" ASC
      `, [studentId, termId]);

      if (payments.rows.length === 0) {
        console.log('  No payments found\n');
        continue;
      }

      console.log(`  Fee structures: ${feeStructures.rows.map(f => `${f.feeType} (${f.amount})`).join(', ')}`);
      console.log(`  Payments: ${payments.rows.length} payment(s)`);

      // Track how much has been allocated to each fee type
      const allocated = {};
      feeStructures.rows.forEach(fs => {
        allocated[fs.feeType] = 0;
      });

      // Allocate each payment
      for (const payment of payments.rows) {
        let remaining = parseFloat(payment.amount);
        console.log(`\n  Payment ${payment.id}: MK ${payment.amount}`);

        // First try to match exact fee type
        const matchingFeeStructure = feeStructures.rows.find(
          fs => fs.feeType.toLowerCase() === payment.paymentType.toLowerCase()
        );

        if (matchingFeeStructure && remaining > 0) {
          const needed = parseFloat(matchingFeeStructure.amount) - allocated[matchingFeeStructure.feeType];
          if (needed > 0) {
            const allocAmount = Math.min(remaining, needed);
            
            // Create allocation
            await client.query(`
              INSERT INTO payment_allocations 
                ("schoolId", "paymentId", "academicCalendarId", "termId", "allocatedAmount", "feeType", "allocationReason", "isAutoAllocation")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [schoolId, payment.id, academicCalendarId, termId, allocAmount, matchingFeeStructure.feeType, 'term_fees', true]);

            allocated[matchingFeeStructure.feeType] += allocAmount;
            remaining -= allocAmount;
            console.log(`    → ${matchingFeeStructure.feeType}: MK ${allocAmount.toFixed(2)}`);
          }
        }

        // Allocate remaining amount to outstanding fees in order (mandatory first)
        for (const feeStructure of feeStructures.rows) {
          if (remaining <= 0.01) break; // Stop if nothing left (with small tolerance for rounding)

          const needed = parseFloat(feeStructure.amount) - allocated[feeStructure.feeType];
          if (needed > 0.01) {
            const allocAmount = Math.min(remaining, needed);

            // Create allocation
            await client.query(`
              INSERT INTO payment_allocations 
                ("schoolId", "paymentId", "academicCalendarId", "termId", "allocatedAmount", "feeType", "allocationReason", "isAutoAllocation")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [schoolId, payment.id, academicCalendarId, termId, allocAmount, feeStructure.feeType, 'term_fees', true]);

            allocated[feeStructure.feeType] += allocAmount;
            remaining -= allocAmount;
            console.log(`    → ${feeStructure.feeType}: MK ${allocAmount.toFixed(2)}`);
          }
        }

        // If there's still remaining (overpayment), create an overpayment allocation
        if (remaining > 0.01) {
          await client.query(`
            INSERT INTO payment_allocations 
              ("schoolId", "paymentId", "academicCalendarId", "termId", "allocatedAmount", "feeType", "allocationReason", "isAutoAllocation")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [schoolId, payment.id, academicCalendarId, termId, remaining, 'Overpayment', 'advance_payment', true]);

          console.log(`    → Overpayment: MK ${remaining.toFixed(2)}`);
        }
      }

      console.log('  ✅ Allocations created\n');
    }

    console.log('✅ All payments allocated successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

allocatePaymentsToFeeTypes();
