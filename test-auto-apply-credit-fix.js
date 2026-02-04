/**
 * Test auto-apply credit fix for Catherine Wambui
 * 
 * Expected:
 * - Term 1: MK 160,000 outstanding (Expected: 300k, Paid: 140k)
 * - Term 2: MK 300,000 outstanding (Expected: 300k, Paid: 0)
 * - Term 3: MK 0 outstanding (Expected: 200k, Paid: 200k) [Current]
 * - Credit: MK 400,000 available
 * 
 * Should apply:
 * - MK 160,000 to Term 1 (fully paid)
 * - MK 240,000 to Term 2 (partial payment, MK 60,000 still outstanding)
 * - MK 0 credit remaining
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
const STUDENT_ID = 'dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2'; // Catherine Wambui
const STUDENT_NUMBER = '260026';

async function testAutoApplyCredit() {
  console.log('🧪 Testing Auto-Apply Credit Fix\n');
  console.log(`Student: Catherine Wambui (${STUDENT_NUMBER})`);
  console.log(`Student ID: ${STUDENT_ID}\n`);

  try {
    // Step 1: Get financial details before
    console.log('📊 Step 1: Getting financial details BEFORE...');
    const beforeResponse = await axios.get(
      `${BASE_URL}/finance/students/${STUDENT_ID}/comprehensive`,
      {
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN_HERE', // Replace with actual token
          'Content-Type': 'application/json'
        }
      }
    );

    const before = beforeResponse.data;
    console.log(`   Total Expected: MK ${before.totalExpected}`);
    console.log(`   Total Paid: MK ${before.totalPaid}`);
    console.log(`   Outstanding: MK ${before.outstanding}`);
    console.log(`   Credit Balance: MK ${before.creditBalance}\n`);

    console.log('   Term Breakdown:');
    before.historicalData.forEach(term => {
      console.log(`   - Term ${term.termNumber}: Expected MK ${term.totalExpected}, Paid MK ${term.totalPaid}, Outstanding MK ${term.outstandingAmount}`);
    });
    console.log();

    // Step 2: Apply credit
    console.log('⚡ Step 2: Applying credit to outstanding fees...');
    console.log('   Calling POST /finance/credits/auto-apply-all-terms/' + STUDENT_ID);
    console.log('   Watch backend logs for detailed processing...\n');
    
    const applyResponse = await axios.post(
      `${BASE_URL}/finance/credits/auto-apply-all-terms/${STUDENT_ID}`,
      {},
      {
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN_HERE', // Replace with actual token
          'Content-Type': 'application/json'
        }
      }
    );

    const result = applyResponse.data;
    console.log('✅ Credit Application Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Total Credit Applied: MK ${result.totalCreditApplied}`);
    console.log(`   Terms Processed: ${result.termsProcessed}`);
    console.log(`   Remaining Credit: MK ${result.remainingCredit}`);
    console.log(`   Message: ${result.message}\n`);

    if (result.applications && result.applications.length > 0) {
      console.log('   Applications:');
      result.applications.forEach(app => {
        console.log(`   - ${app.termName}:`);
        console.log(`     Outstanding Before: MK ${app.outstandingBefore}`);
        console.log(`     Credit Applied: MK ${app.creditApplied}`);
        console.log(`     Outstanding After: MK ${app.outstandingAfter}`);
      });
      console.log();
    }

    // Step 3: Get financial details after
    console.log('📊 Step 3: Getting financial details AFTER...');
    const afterResponse = await axios.get(
      `${BASE_URL}/finance/students/${STUDENT_ID}/comprehensive`,
      {
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN_HERE', // Replace with actual token
          'Content-Type': 'application/json'
        }
      }
    );

    const after = afterResponse.data;
    console.log(`   Total Expected: MK ${after.totalExpected}`);
    console.log(`   Total Paid: MK ${after.totalPaid}`);
    console.log(`   Outstanding: MK ${after.outstanding}`);
    console.log(`   Credit Balance: MK ${after.creditBalance}\n`);

    console.log('   Term Breakdown:');
    after.historicalData.forEach(term => {
      console.log(`   - Term ${term.termNumber}: Expected MK ${term.totalExpected}, Paid MK ${term.totalPaid}, Outstanding MK ${term.outstandingAmount}`);
    });
    console.log();

    // Step 4: Validation
    console.log('✓ Step 4: Validation');
    const expectedResults = {
      term1Outstanding: 0, // Should be fully paid
      term2Outstanding: 60000, // Should have 60k remaining
      creditRemaining: 0, // Should be fully used
      totalApplied: 400000 // Should apply all 400k
    };

    const term1After = after.historicalData.find(t => t.termNumber === 1);
    const term2After = after.historicalData.find(t => t.termNumber === 2);

    const checks = [
      {
        name: 'Term 1 fully paid',
        actual: term1After?.outstandingAmount || 0,
        expected: expectedResults.term1Outstanding,
        pass: (term1After?.outstandingAmount || 0) === expectedResults.term1Outstanding
      },
      {
        name: 'Term 2 partial payment',
        actual: term2After?.outstandingAmount || 0,
        expected: expectedResults.term2Outstanding,
        pass: (term2After?.outstandingAmount || 0) === expectedResults.term2Outstanding
      },
      {
        name: 'Credit fully used',
        actual: result.remainingCredit,
        expected: expectedResults.creditRemaining,
        pass: result.remainingCredit === expectedResults.creditRemaining
      },
      {
        name: 'Total credit applied',
        actual: result.totalCreditApplied,
        expected: expectedResults.totalApplied,
        pass: result.totalCreditApplied === expectedResults.totalApplied
      }
    ];

    console.log('   Validation Results:');
    let allPassed = true;
    checks.forEach(check => {
      const icon = check.pass ? '✅' : '❌';
      console.log(`   ${icon} ${check.name}: Expected ${check.expected}, Got ${check.actual}`);
      if (!check.pass) allPassed = false;
    });
    console.log();

    if (allPassed) {
      console.log('🎉 All tests PASSED! Auto-apply credit is working correctly.');
    } else {
      console.log('⚠️  Some tests FAILED. Check the results above.');
    }

  } catch (error) {
    console.error('❌ Error during test:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testAutoApplyCredit();
