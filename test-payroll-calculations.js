const { DataSource } = require('typeorm');

// Simple test script to verify payroll calculations
async function testPayrollCalculations() {
  console.log('🧮 Testing Payroll Calculations...\n');

  try {
    const dataSource = new DataSource({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'Thabiso2020',
      database: 'schomas',
      entities: [],
      synchronize: false,
      logging: false
    });

    await dataSource.initialize();
    console.log('✅ Database connected\n');

    // Check for pay components with deductions
    const deductionComponents = await dataSource.query(`
      SELECT 
        id, name, type, defaultAmount, department, autoAssign
      FROM pay_components 
      WHERE type = 'DEDUCTION' 
      ORDER BY name
    `);

    console.log('📋 Found Deduction Components:');
    deductionComponents.forEach(comp => {
      console.log(`  - ${comp.name}: MK ${comp.defaultAmount} (Auto: ${comp.autoAssign ? 'Yes' : 'No'}, Dept: ${comp.department || 'All'})`);
    });
    console.log('');

    // Check recent salary runs
    const recentRuns = await dataSource.query(`
      SELECT 
        id, name, DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') as created,
        staffCount, totalGross, totalNet
      FROM salary_runs 
      ORDER BY createdAt DESC 
      LIMIT 5
    `);

    console.log('📊 Recent Salary Runs:');
    recentRuns.forEach(run => {
      const deductionAmount = run.totalGross - run.totalNet;
      console.log(`  - ${run.name} (${run.created}): ${run.staffCount} staff`);
      console.log(`    Gross: MK ${run.totalGross}, Net: MK ${run.totalNet}, Deductions: MK ${deductionAmount}`);
    });
    console.log('');

    // Check salary items for a recent run to see individual calculations
    if (recentRuns.length > 0) {
      const latestRunId = recentRuns[0].id;
      
      const salaryItems = await dataSource.query(`
        SELECT 
          staffName, department, grossPay, otherDeductions, netPay, breakdown
        FROM salary_items 
        WHERE runId = ? 
        ORDER BY staffName
        LIMIT 10
      `, [latestRunId]);

      console.log(`🧾 Sample Salary Items from "${recentRuns[0].name}":"`);
      salaryItems.forEach(item => {
        const calculatedNet = item.grossPay - item.otherDeductions;
        const isCorrect = Math.abs(calculatedNet - item.netPay) < 0.01 ? '✅' : '❌';
        
        console.log(`  ${isCorrect} ${item.staffName} (${item.department}):`);
        console.log(`    Gross: MK ${item.grossPay}, Deductions: MK ${item.otherDeductions}, Net: MK ${item.netPay}`);
        console.log(`    Expected Net: MK ${calculatedNet.toFixed(2)}`);
        
        // Parse breakdown to see components
        if (item.breakdown) {
          try {
            const breakdown = JSON.parse(item.breakdown);
            console.log(`    Components: ${breakdown.length} items`);
            breakdown.forEach(comp => {
              const symbol = comp.type === 'DEDUCTION' ? '-' : '+';
              console.log(`      ${symbol} ${comp.name}: MK ${comp.amount} (${comp.type})`);
            });
          } catch (e) {
            console.log(`    Breakdown: ${item.breakdown.substring(0, 50)}...`);
          }
        }
        console.log('');
      });
    }

    await dataSource.destroy();
    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPayrollCalculations();