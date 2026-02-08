// Integration test: Verify current term overpayments calculation
// Reads DB for credits and applied-to-previous allocations in current term and compares with API metric

const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function main() {
  const db = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'schomas',
    port: Number(process.env.DB_PORT || 5432),
  });
  await db.connect();

  try {
    // Find current term
    const termRow = await db.query(
      `SELECT id, start_date, end_date FROM term WHERE is_current = true LIMIT 1`
    );
    if (!termRow.rows.length) throw new Error('No current term found');
    const term = termRow.rows[0];

    // Sum credits captured in current term
    const creditsRes = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS sum
       FROM credit_ledger
       WHERE term_id = $1 OR (created_at BETWEEN $2 AND $3)`,
      [term.id, term.start_date, term.end_date]
    );
    const sumCredits = Number(creditsRes.rows[0].sum || 0);

    // Sum allocations from current-term payments applied to previous terms
    const appliedRes = await db.query(
      `SELECT COALESCE(SUM(pa.allocated_amount), 0) AS sum
       FROM payment_allocations pa
       INNER JOIN fee_payment fp ON fp.id = pa.payment_id
       WHERE fp.status = 'completed'
         AND (fp.term_id = $1 OR (fp.payment_date BETWEEN $2 AND $3))
         AND pa.term_id <> $1
         AND pa.allocation_reason IN ('historical_settlement','carry_forward_settlement')`,
      [term.id, term.start_date, term.end_date]
    );
    const sumAppliedToPrevious = Number(appliedRes.rows[0].sum || 0);

    const expectedOverpayments = sumCredits + sumAppliedToPrevious;

    // Fetch API metric
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';
    const token = process.env.TEST_TOKEN || '';
    const res = await fetch(`${baseUrl}/finance/total-finances`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`API failed: ${res.status}`);
    const data = await res.json();
    const apiOverpayments = Number(data.currentTermOverpayments || 0);

    console.log('Expected overpayments:', expectedOverpayments);
    console.log('API overpayments:     ', apiOverpayments);

    if (Math.abs(expectedOverpayments - apiOverpayments) < 0.01) {
      console.log('✅ Test passed: Overpayments match.');
    } else {
      console.error('❌ Test failed: Overpayments mismatch.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Test error:', err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
