/**
 * Test Complete Credit Auto-Apply Flow
 * Tests the automatic credit application when overpayment creates a credit
 */

const BASE_URL = 'http://localhost:5000/api/v1';

// Replace these with actual values from your system
const AUTH_TOKEN = 'YOUR_AUTH_TOKEN_HERE';
const STUDENT_ID = 'MARGARET_WANGARI_UUID';  // Margaret Wangari's student ID
const TERM_2_ID = 'TERM_2_UUID';  // Term 2 ID where overpayment occurred
const SCHOOL_ID = 'YOUR_SCHOOL_ID';

async function runTest() {
  console.log('🧪 Testing Complete Auto-Apply Credit Flow\n');
  console.log('='.repeat(60));

  // Step 1: Get initial state
  console.log('\n📊 STEP 1: Get Initial Financial State');
  console.log('-'.repeat(60));
  const initialState = await getFinancialDetails(STUDENT_ID);
  displayFinancialSummary('Initial State', initialState);

  // Step 2: Manually trigger auto-apply (to fix existing credits)
  console.log('\n🔄 STEP 2: Manually Trigger Auto-Apply');
  console.log('-'.repeat(60));
  const applyResult = await applyCreditsAcrossAllTerms(STUDENT_ID);
  console.log('Result:', applyResult.message);
  if (applyResult.applications && applyResult.applications.length > 0) {
    console.log('\nApplications:');
    applyResult.applications.forEach(app => {
      console.log(`  ✓ ${app.termName}`);
      console.log(`    Applied: MK ${app.creditApplied.toLocaleString()}`);
      console.log(`    Outstanding: MK ${app.outstandingBefore.toLocaleString()} → MK ${app.outstandingAfter.toLocaleString()}`);
    });
  }

  // Step 3: Get updated state
  console.log('\n📊 STEP 3: Get Updated Financial State');
  console.log('-'.repeat(60));
  await sleep(2000); // Wait for database to update
  const finalState = await getFinancialDetails(STUDENT_ID);
  displayFinancialSummary('Final State', finalState);

  // Step 4: Compare results
  console.log('\n📈 STEP 4: Comparison');
  console.log('-'.repeat(60));
  console.log('Credit Balance Change:');
  console.log(`  Before: MK ${initialState.summary.creditBalance.toLocaleString()}`);
  console.log(`  After:  MK ${finalState.summary.creditBalance.toLocaleString()}`);
  console.log(`  Change: MK ${(initialState.summary.creditBalance - finalState.summary.creditBalance).toLocaleString()}`);
  
  console.log('\nOutstanding Balance Change:');
  console.log(`  Before: MK ${initialState.summary.totalOutstandingAllTerms.toLocaleString()}`);
  console.log(`  After:  MK ${finalState.summary.totalOutstandingAllTerms.toLocaleString()}`);
  console.log(`  Change: MK ${(initialState.summary.totalOutstandingAllTerms - finalState.summary.totalOutstandingAllTerms).toLocaleString()}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test Complete!\n');
}

async function getFinancialDetails(studentId) {
  const response = await fetch(
    `${BASE_URL}/finance/student-financial-details/${studentId}`,
    {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch financial details: ${response.statusText}`);
  }

  return await response.json();
}

async function applyCreditsAcrossAllTerms(studentId) {
  const response = await fetch(
    `${BASE_URL}/finance/credits/auto-apply-all-terms/${studentId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to apply credits: ${response.statusText}`);
  }

  return await response.json();
}

function displayFinancialSummary(title, data) {
  console.log(`\n${title}:`);
  console.log(`  Total Expected:  MK ${data.summary.totalExpectedAllTerms.toLocaleString()}`);
  console.log(`  Total Paid:      MK ${data.summary.totalPaidAllTerms.toLocaleString()}`);
  console.log(`  Outstanding:     MK ${data.summary.totalOutstandingAllTerms.toLocaleString()}`);
  console.log(`  Credit Balance:  MK ${data.summary.creditBalance.toLocaleString()}`);
  console.log(`  Payment %:       ${data.summary.paymentPercentage}%`);

  console.log('\n  Term Breakdown:');
  data.termBreakdown.forEach(term => {
    const badge = term.isCurrentTerm ? '(Current)' : term.isPastTerm ? '(Past)' : '';
    console.log(`    Term ${term.termNumber} ${badge}:`);
    console.log(`      Expected: MK ${term.totalExpected.toLocaleString()}`);
    console.log(`      Paid:     MK ${term.totalPaid.toLocaleString()}`);
    console.log(`      Outstanding: MK ${term.outstanding.toLocaleString()} [${term.status}]`);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
