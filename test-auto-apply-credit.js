/**
 * Test Auto-Apply Credit Feature
 * 
 * Scenario: Student has credit balance from overpayment in Term 2
 * Should automatically apply to:
 * 1. Outstanding fees in past terms (Term 1)
 * 2. Outstanding fees in current term (Term 3)
 */

const BASE_URL = 'http://localhost:5000/api/v1';
const TOKEN = 'YOUR_AUTH_TOKEN'; // Replace with actual token

async function testAutoApplyCredit() {
  console.log('🧪 Testing Auto-Apply Credit Feature\n');

  // Test Case: Margaret Wangari (Student ID: 260030)
  const studentId = 'STUDENT_UUID_HERE'; // Replace with actual UUID

  console.log('📊 Expected Scenario:');
  console.log('- Credit Balance: MK 210,000.00');
  console.log('- Term 1 Outstanding: MK 210,000.00');
  console.log('- Term 3 Outstanding: MK 200,000.00\n');

  // Get student financial details before
  console.log('1️⃣ Fetching student financial status BEFORE auto-apply...');
  const beforeResponse = await fetch(`${BASE_URL}/finance/student-financial-details/${studentId}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const beforeData = await beforeResponse.json();
  console.log('   Credit Balance:', `MK ${Number(beforeData.creditBalance || 0).toLocaleString()}`);
  console.log('   Outstanding:', `MK ${Number(beforeData.totalOutstanding || 0).toLocaleString()}\n`);

  // Trigger auto-apply across all terms
  console.log('2️⃣ Triggering auto-apply credit across all terms...');
  const applyResponse = await fetch(
    `${BASE_URL}/finance/credits/auto-apply-all-terms/${studentId}`,
    {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const applyResult = await applyResponse.json();
  console.log('   ✅ Result:', applyResult.message);
  console.log('   📝 Applications:');
  applyResult.applications?.forEach(app => {
    console.log(`      - ${app.termName}:`);
    console.log(`        Credit Applied: MK ${app.creditApplied.toLocaleString()}`);
    console.log(`        Outstanding: MK ${app.outstandingBefore.toLocaleString()} → MK ${app.outstandingAfter.toLocaleString()}`);
  });
  console.log(`   💰 Remaining Credit: MK ${applyResult.remainingCredit.toLocaleString()}\n`);

  // Get student financial details after
  console.log('3️⃣ Fetching student financial status AFTER auto-apply...');
  const afterResponse = await fetch(`${BASE_URL}/finance/student-financial-details/${studentId}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const afterData = await afterResponse.json();
  console.log('   Credit Balance:', `MK ${Number(afterData.creditBalance || 0).toLocaleString()}`);
  console.log('   Outstanding:', `MK ${Number(afterData.totalOutstanding || 0).toLocaleString()}\n`);

  console.log('✅ Test Complete!\n');
  console.log('Expected Outcome:');
  console.log('- Term 1 outstanding should be reduced or cleared');
  console.log('- If credit remains, Term 3 outstanding should be reduced');
  console.log('- Credit balance should be reduced or cleared');
}

// Run test
testAutoApplyCredit().catch(console.error);
