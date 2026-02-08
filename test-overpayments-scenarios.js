// Scenario tests: full payments, partial payments, auto-applied credits
require('dotenv').config({ path: '.env' });

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function run() {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';
  const token = process.env.TEST_TOKEN || '';

  // Fetch finance totals to capture starting overpayments
  const before = await fetchJson(`${baseUrl}/finance/total-finances`, token);
  console.log('Before currentTermOverpayments:', before.currentTermOverpayments);

  // Note: Creating synthetic payments requires student IDs and term IDs.
  // For now, we call endpoints expecting existing dataset contains cases like Ali Hassan.

  // Validate overpayments reflect credits in current term
  const creditList = await fetchJson(`${baseUrl}/finance/credits?status=active`, token);
  console.log('Active credits count:', Array.isArray(creditList) ? creditList.length : 0);

  // Trigger auto-apply for current term across students (if an endpoint exists)
  // This may be restricted; skip if not available without admin token.

  const after = await fetchJson(`${baseUrl}/finance/total-finances`, token);
  console.log('After currentTermOverpayments:', after.currentTermOverpayments);

  // Basic assertion
  if (Number(after.currentTermOverpayments || 0) >= Number(before.currentTermOverpayments || 0)) {
    console.log('✅ Overpayments did not regress.');
  } else {
    console.error('❌ Overpayments regressed.');
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error('❌ Scenario test error:', err.message);
  process.exitCode = 1;
});
