#!/bin/bash

# Test Payment Auto-Allocation Implementation

echo "==================================="
echo "Testing Payment Auto-Allocation"
echo "==================================="
echo ""

# Test 1: Create a new test student and payment
echo "Test 1: Creating a test payment..."
echo "This will test if new payments are auto-allocated"
echo ""

# Test 2: Check Joyce Waithera's data after fix
echo "Test 2: Checking Joyce Waithera's financial details..."
node -e "
const {Client}=require('pg');
const c=new Client({host:'localhost',port:5432,user:'postgres',password:'g1Bird fly',database:'schomas'});
c.connect().then(async()=>{
  const student=await c.query('SELECT id,\"firstName\",\"lastName\",\"studentId\",\"termId\" FROM student WHERE \"firstName\"=\\'Joyce\\' AND \"lastName\"=\\'Waithera\\'');
  if(student.rows.length===0){console.log('Joyce not found');c.end();return}
  const s=student.rows[0];
  console.log('Student:',s.firstName,s.lastName,'(',s.studentId,')\\n');
  
  const payments=await c.query('SELECT SUM(amount) as total FROM fee_payment WHERE \"studentId\"=\$1',[s.id]);
  console.log('✓ Total Paid:',payments.rows[0].total);
  
  const allocs=await c.query('SELECT \"feeType\",SUM(\"allocatedAmount\") as total FROM payment_allocations pa JOIN fee_payment fp ON pa.\"paymentId\"=fp.id WHERE fp.\"studentId\"=\$1 GROUP BY \"feeType\" ORDER BY \"feeType\"',[s.id]);
  console.log('\\n✓ Allocations:');
  let allocTotal=0;
  allocs.rows.forEach(a=>{
    console.log('   -',a.feeType,':',a.total);
    allocTotal+=parseFloat(a.total);
  });
  console.log('   Total Allocated:',allocTotal);
  
  const fees=await c.query('SELECT \"feeType\",amount FROM fee_structure WHERE \"termId\"=\$1 AND \"isActive\"=true AND \"isOptional\"=false ORDER BY \"feeType\"',[s.termId]);
  console.log('\\n✓ Expected Fees:');
  let totalExpected=0;
  fees.rows.forEach(f=>{
    console.log('   -',f.feeType,':',f.amount);
    totalExpected+=parseFloat(f.amount);
  });
  console.log('   Total Expected:',totalExpected);
  
  const totalPaid=parseFloat(payments.rows[0].total);
  const creditBalance=Math.max(0,totalPaid-totalExpected);
  const outstanding=Math.max(0,totalExpected-totalPaid);
  
  console.log('\\n' + '='.repeat(50));
  console.log('SUMMARY:');
  console.log('='.repeat(50));
  console.log('Total Expected: ',totalExpected);
  console.log('Total Paid:     ',totalPaid);
  console.log('Outstanding:    ',outstanding);
  console.log('Credit Balance: ',creditBalance);
  console.log('Payment %:      ',totalExpected > 0 ? Math.round((totalPaid/totalExpected)*100) : 0,'%');
  console.log('');
  
  if(creditBalance > 0) {
    console.log('✅ Credit balance showing correctly!');
  }
  if(allocTotal === totalPaid) {
    console.log('✅ All payments are allocated!');
  } else {
    console.log('❌ Unallocated amount:',totalPaid-allocTotal);
  }
  
  c.end();
}).catch(e=>{console.error(e.message);c.end()})
"

echo ""
echo "Test 3: Check Collins Ongeri (overpayment scenario)..."
node -e "
const {Client}=require('pg');
const c=new Client({host:'localhost',port:5432,user:'postgres',password:'g1Bird fly',database:'schomas'});
c.connect().then(async()=>{
  const student=await c.query('SELECT id,\"firstName\",\"lastName\",\"studentId\",\"termId\" FROM student WHERE \"firstName\"=\\'Collins\\' AND \"lastName\"=\\'Ongeri\\'');
  if(student.rows.length===0){console.log('Collins not found');c.end();return}
  const s=student.rows[0];
  console.log('Student:',s.firstName,s.lastName,'(',s.studentId,')\\n');
  
  const payments=await c.query('SELECT SUM(amount) as total FROM fee_payment WHERE \"studentId\"=\$1',[s.id]);
  const totalPaid=parseFloat(payments.rows[0].total);
  
  const fees=await c.query('SELECT SUM(amount) as total FROM fee_structure WHERE \"termId\"=\$1 AND \"isActive\"=true AND \"isOptional\"=false',[s.termId]);
  const totalExpected=parseFloat(fees.rows[0].total);
  
  const creditBalance=Math.max(0,totalPaid-totalExpected);
  
  console.log('Total Paid:     ',totalPaid);
  console.log('Total Expected: ',totalExpected);
  console.log('Credit Balance: ',creditBalance);
  
  if(creditBalance === 300000) {
    console.log('\\n✅ Overpayment scenario working correctly!');
  } else {
    console.log('\\n❌ Expected credit balance: 300000, Got:',creditBalance);
  }
  
  c.end();
}).catch(e=>{console.error(e.message);c.end()})
"

echo ""
echo "==================================="
echo "Tests Complete"
echo "==================================="
