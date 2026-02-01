const axios = require('axios');

async function testFinanceConsistency() {
  try {
    // Test finance summary endpoint multiple times
    console.log('Testing /finance/summary endpoint consistency...\n');
    
    const results = [];
    for (let i = 1; i <= 5; i++) {
      try {
        console.log(`Test ${i}:`);
        const response = await axios.get('http://localhost:4000/finance/summary', {
          params: { 
            termId: '7ca7c842-0a6b-4d17-b4e3-8a9edf1b4f4c'  // Current term ID
          },
          headers: {
            'Authorization': 'Bearer fake-token',  // This will fail but let's see the structure
          }
        });
        
        const data = response.data;
        console.log(`  Expected Fees: MK ${(data.summary?.expectedFees || 0).toLocaleString()}`);
        console.log(`  Total Paid: MK ${(data.summary?.totalFeesPaid || 0).toLocaleString()}`);
        console.log(`  Students in statuses: ${data.statuses?.length || 0}`);
        
        results.push({
          test: i,
          expectedFees: data.summary?.expectedFees || 0,
          totalPaid: data.summary?.totalFeesPaid || 0,
          statusCount: data.statuses?.length || 0
        });
        
      } catch (error) {
        console.log(`  Error: ${error.response?.status} - ${error.response?.statusText}`);
        if (error.response?.status === 401) {
          console.log('  (Expected - auth required)');
        } else {
          console.log(`  Full error: ${error.message}`);
        }
      }
      
      console.log('');
      
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Analyze results
    if (results.length > 1) {
      const unique = {
        expectedFees: new Set(results.map(r => r.expectedFees)).size,
        totalPaid: new Set(results.map(r => r.totalPaid)).size,
        statusCount: new Set(results.map(r => r.statusCount)).size
      };
      
      console.log('Analysis:');
      console.log(`  Expected Fees variations: ${unique.expectedFees} different values`);
      console.log(`  Total Paid variations: ${unique.totalPaid} different values`);
      console.log(`  Status Count variations: ${unique.statusCount} different values`);
      
      if (unique.expectedFees > 1 || unique.totalPaid > 1 || unique.statusCount > 1) {
        console.log('❌ INCONSISTENCY DETECTED!');
      } else {
        console.log('✅ Results are consistent');
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testFinanceConsistency();