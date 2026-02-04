require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'schomas',
  user: 'postgres',
  password: 'g1Bird fly',
});

async function check() {
  const client = await pool.connect();
  try {
    // Get current term
    const term = await client.query(`
      SELECT id, "termNumber", "startDate", "endDate", "isCurrent"
      FROM term 
      WHERE "isCurrent" = true 
      LIMIT 1
    `);
    
    console.log('CURRENT TERM:', term.rows[0]);
    const termId = term.rows[0]?.id;
    
    if (!termId) {
      console.log('NO CURRENT TERM!');
      return;
    }
    
    // Check payments by term_id
    const byTermId = await client.query(`
      SELECT COUNT(*), SUM(amount) as total
      FROM fee_payment
      WHERE "termId" = $1 AND status = 'completed'
    `, [termId]);
    
    console.log('\nPAYMENTS BY TERM_ID:', byTermId.rows[0]);
    
    // Check payments by date range
    const byDate = await client.query(`
      SELECT COUNT(*), SUM(amount) as total
      FROM fee_payment
      WHERE "paymentDate" BETWEEN $1 AND $2 AND status = 'completed'
    `, [term.rows[0].startDate, term.rows[0].endDate]);
    
    console.log('PAYMENTS BY DATE RANGE:', byDate.rows[0]);
    
    // Show sample payments
    const samples = await client.query(`
      SELECT id, amount, "paymentDate", "termId"
      FROM fee_payment
      WHERE status = 'completed'
      ORDER BY "paymentDate" DESC
      LIMIT 10
    `);
    
    console.log('\nSAMPLE PAYMENTS:');
    samples.rows.forEach(p => {
      console.log(`  ${p.paymentDate}: MK ${parseFloat(p.amount).toLocaleString()} [termId: ${p.termId}]`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
