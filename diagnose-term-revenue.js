/**
 * Diagnostic script to check why term-based financial report shows MK 0
 * when Finance page shows actual payments
 */

const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE || 'schomas',
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'g1Bird fly',
});

async function diagnose() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // 1. Check current term
    console.log('=== CURRENT TERM ===');
    const currentTerm = await client.query(`
      SELECT 
        t.id,
        t.term_number,
        ac.term as calendar_term,
        t.start_date,
        t.end_date,
        t.is_current,
        t.is_completed,
        t.school_id
      FROM term t
      LEFT JOIN academic_calendar ac ON ac.id = t.academic_calendar_id
      WHERE t.is_current = true
      LIMIT 1
    `);
    
    if (currentTerm.rows.length === 0) {
      console.log('❌ NO CURRENT TERM FOUND!');
      return;
    }
    
    const term = currentTerm.rows[0];
    console.log('Current Term:', {
      id: term.id,
      name: `${term.calendar_term} Term ${term.term_number}`,
      dates: `${term.start_date} to ${term.end_date}`,
      isCurrent: term.is_current,
      isCompleted: term.is_completed,
      schoolId: term.school_id
    });
    console.log('');

    // 2. Check ALL payments for this school
    console.log('=== ALL COMPLETED PAYMENTS (by school) ===');
    const allPayments = await client.query(`
      SELECT 
        fp.id,
        fp.amount,
        fp.payment_date,
        fp.term_id,
        fp.status,
        fp.school_id,
        t.term_number,
        ac.term as calendar_term
      FROM fee_payment fp
      LEFT JOIN term t ON t.id = fp.term_id
      LEFT JOIN academic_calendar ac ON ac.id = t.academic_calendar_id
      WHERE fp.school_id = $1 
        AND fp.status = 'completed'
      ORDER BY fp.payment_date DESC
      LIMIT 20
    `, [term.school_id]);
    
    console.log(`Found ${allPayments.rows.length} completed payments:`);
    let totalPayments = 0;
    allPayments.rows.forEach(p => {
      totalPayments += parseFloat(p.amount);
      console.log(`  - MK ${parseFloat(p.amount).toLocaleString()} on ${p.payment_date} [Term: ${p.calendar_term} T${p.term_number}]`);
    });
    console.log(`  TOTAL: MK ${totalPayments.toLocaleString()}\n`);

    // 3. Check payments within current term dates
    console.log('=== PAYMENTS WITHIN CURRENT TERM DATES ===');
    const termPayments = await client.query(`
      SELECT 
        fp.id,
        fp.amount,
        fp.payment_date,
        fp.status
      FROM fee_payment fp
      WHERE fp.school_id = $1
        AND fp.status = 'completed'
        AND fp.payment_date BETWEEN $2 AND $3
      ORDER BY fp.payment_date
    `, [term.school_id, term.start_date, term.end_date]);
    
    console.log(`Found ${termPayments.rows.length} payments within term dates (${term.start_date} to ${term.end_date}):`);
    let termTotal = 0;
    termPayments.rows.forEach(p => {
      termTotal += parseFloat(p.amount);
      console.log(`  - MK ${parseFloat(p.amount).toLocaleString()} on ${p.payment_date}`);
    });
    console.log(`  TOTAL: MK ${termTotal.toLocaleString()}\n`);

    // 4. Check payments with current termId
    console.log('=== PAYMENTS WITH CURRENT TERM ID ===');
    const termIdPayments = await client.query(`
      SELECT 
        fp.id,
        fp.amount,
        fp.payment_date,
        fp.status
      FROM fee_payment fp
      WHERE fp.term_id = $1
        AND fp.status = 'completed'
      ORDER BY fp.payment_date
    `, [term.id]);
    
    console.log(`Found ${termIdPayments.rows.length} payments with termId = ${term.id}:`);
    let termIdTotal = 0;
    termIdPayments.rows.forEach(p => {
      termIdTotal += parseFloat(p.amount);
      console.log(`  - MK ${parseFloat(p.amount).toLocaleString()} on ${p.payment_date}`);
    });
    console.log(`  TOTAL: MK ${termIdTotal.toLocaleString()}\n`);

    // 5. Check completed terms
    console.log('=== COMPLETED TERMS (last 3) ===');
    const completedTerms = await client.query(`
      SELECT 
        t.id,
        t.term_number,
        ac.term as calendar_term,
        t.start_date,
        t.end_date,
        t.is_completed,
        COUNT(fp.id) as payment_count,
        COALESCE(SUM(fp.amount), 0) as total_revenue
      FROM term t
      LEFT JOIN academic_calendar ac ON ac.id = t.academic_calendar_id
      LEFT JOIN fee_payment fp ON fp.term_id = t.id AND fp.status = 'completed'
      WHERE t.school_id = $1 
        AND t.is_completed = true
      GROUP BY t.id, t.term_number, ac.term, t.start_date, t.end_date, t.is_completed
      ORDER BY t.end_date DESC
      LIMIT 3
    `, [term.school_id]);
    
    completedTerms.rows.forEach(t => {
      console.log(`${t.calendar_term} Term ${t.term_number} (${t.start_date} to ${t.end_date}):`);
      console.log(`  - ${t.payment_count} payments = MK ${parseFloat(t.total_revenue).toLocaleString()}`);
    });
    console.log('');

    // 6. DIAGNOSIS
    console.log('=== DIAGNOSIS ===');
    if (termIdTotal > 0) {
      console.log('✅ Payments exist with current term ID');
      console.log(`   Revenue by term_id: MK ${termIdTotal.toLocaleString()}`);
    } else {
      console.log('❌ NO payments have the current term ID!');
    }
    
    if (termTotal > 0) {
      console.log('✅ Payments exist within current term date range');
      console.log(`   Revenue by date range: MK ${termTotal.toLocaleString()}`);
    } else {
      console.log('❌ NO payments fall within the current term date range!');
      console.log(`   Term dates: ${term.start_date} to ${term.end_date}`);
    }

    console.log('\n=== RECOMMENDATION ===');
    if (termIdTotal === 0 && termTotal === 0) {
      console.log('The backend query is filtering by BOTH:');
      console.log('  1. payment_date BETWEEN term.startDate AND term.endDate');
      console.log('  2. payment.schoolId = term.schoolId');
      console.log('\nBUT the backend does NOT filter by term_id in the payment query.');
      console.log('This means if payments were recorded with different termIds,');
      console.log('or if payment_date falls outside the term date range, they wont show.');
      console.log('\nSOLUTION: The Finance page filters by term_id directly.');
      console.log('The term-based report should ALSO filter by term_id, not date range.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

diagnose();
