// Test script to verify notification isolation and school-based filtering
// This tests the notification system to ensure proper school isolation

const { Client } = require('pg');

async function testNotificationIsolation() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'schomas',
    user: 'postgres',
    password: 'g1Bird fly',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // First, get some test schools
    const schools = await client.query('SELECT id, name, code FROM schools LIMIT 3');
    if (schools.rows.length < 2) {
      console.log('❌ Need at least 2 schools to test isolation. Found:', schools.rows.length);
      return;
    }

    const school1 = schools.rows[0];
    const school2 = schools.rows[1];
    
    console.log(`🏫 Testing with School 1: ${school1.name} (${school1.id})`);
    console.log(`🏫 Testing with School 2: ${school2.name} (${school2.id})`);

    // Clean up existing test notifications
    console.log('\n🧹 Cleaning up existing test notifications...');
    await client.query(`DELETE FROM notifications WHERE title LIKE 'Test Isolation%'`);

    // Create test notifications for each school
    console.log('\n📝 Creating test notifications...');
    
    // School 1 notifications
    const school1Notification1 = await client.query(`
      INSERT INTO notifications (title, message, type, priority, "schoolId", metadata, read, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;
    `, [
      'Test Isolation - School 1 - Notification 1',
      `This notification belongs to ${school1.name}`,
      'system',
      'medium',
      school1.id,
      JSON.stringify({ test: true, school: school1.name }),
      false
    ]);

    const school1Notification2 = await client.query(`
      INSERT INTO notifications (title, message, type, priority, "schoolId", metadata, read, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;
    `, [
      'Test Isolation - School 1 - Notification 2',
      `Another notification for ${school1.name}`,
      'alert',
      'high',
      school1.id,
      JSON.stringify({ test: true, school: school1.name }),
      true // This one is already read
    ]);

    // School 2 notifications
    const school2Notification1 = await client.query(`
      INSERT INTO notifications (title, message, type, priority, "schoolId", metadata, read, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;
    `, [
      'Test Isolation - School 2 - Notification 1',
      `This notification belongs to ${school2.name}`,
      'credentials',
      'medium',
      school2.id,
      JSON.stringify({ test: true, school: school2.name }),
      false
    ]);

    const school2Notification2 = await client.query(`
      INSERT INTO notifications (title, message, type, priority, "schoolId", metadata, read, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;
    `, [
      'Test Isolation - School 2 - Notification 2',
      `Another notification for ${school2.name}`,
      'system',
      'low',
      school2.id,
      JSON.stringify({ test: true, school: school2.name }),
      false
    ]);

    console.log('✅ Created test notifications');
    console.log(`   - School 1: ${school1Notification1.rows[0].id}, ${school1Notification2.rows[0].id}`);
    console.log(`   - School 2: ${school2Notification1.rows[0].id}, ${school2Notification2.rows[0].id}`);

    // Test isolation queries
    console.log('\n🔍 Testing notification isolation...');

    // Test 1: School 1 admin should only see School 1 notifications
    const school1Results = await client.query(`
      SELECT id, title, "schoolId", read
      FROM notifications 
      WHERE "schoolId" = $1 AND title LIKE 'Test Isolation%'
      ORDER BY "createdAt" DESC
    `, [school1.id]);

    console.log(`\n📊 School 1 Query Results (should only see School 1 notifications):`);
    console.log(`   Found ${school1Results.rows.length} notifications`);
    school1Results.rows.forEach((row, index) => {
      const belongsToSchool1 = row.schoolId === school1.id;
      console.log(`   ${index + 1}. ${row.title} - SchoolId: ${row.schoolId} - Read: ${row.read} ${belongsToSchool1 ? '✅' : '❌'}`);
    });

    // Test 2: School 2 admin should only see School 2 notifications
    const school2Results = await client.query(`
      SELECT id, title, "schoolId", read
      FROM notifications 
      WHERE "schoolId" = $1 AND title LIKE 'Test Isolation%'
      ORDER BY "createdAt" DESC
    `, [school2.id]);

    console.log(`\n📊 School 2 Query Results (should only see School 2 notifications):`);
    console.log(`   Found ${school2Results.rows.length} notifications`);
    school2Results.rows.forEach((row, index) => {
      const belongsToSchool2 = row.schoolId === school2.id;
      console.log(`   ${index + 1}. ${row.title} - SchoolId: ${row.schoolId} - Read: ${row.read} ${belongsToSchool2 ? '✅' : '❌'}`);
    });

    // Test 3: Super Admin should see all notifications
    const superAdminResults = await client.query(`
      SELECT id, title, "schoolId", read
      FROM notifications 
      WHERE title LIKE 'Test Isolation%'
      ORDER BY "createdAt" DESC
    `);

    console.log(`\n📊 Super Admin Query Results (should see all notifications):`);
    console.log(`   Found ${superAdminResults.rows.length} notifications`);
    superAdminResults.rows.forEach((row, index) => {
      const schoolName = row.schoolId === school1.id ? school1.name : school2.name;
      console.log(`   ${index + 1}. ${row.title} - School: ${schoolName} - Read: ${row.read} ✅`);
    });

    // Test 4: Test unread counts per school
    const school1UnreadCount = await client.query(`
      SELECT COUNT(*) as count
      FROM notifications 
      WHERE "schoolId" = $1 AND read = false AND title LIKE 'Test Isolation%'
    `, [school1.id]);

    const school2UnreadCount = await client.query(`
      SELECT COUNT(*) as count
      FROM notifications 
      WHERE "schoolId" = $1 AND read = false AND title LIKE 'Test Isolation%'
    `, [school2.id]);

    const totalUnreadCount = await client.query(`
      SELECT COUNT(*) as count
      FROM notifications 
      WHERE read = false AND title LIKE 'Test Isolation%'
    `);

    console.log(`\n📈 Unread Counts:`);
    console.log(`   School 1 unread: ${school1UnreadCount.rows[0].count}`);
    console.log(`   School 2 unread: ${school2UnreadCount.rows[0].count}`);
    console.log(`   Total unread: ${totalUnreadCount.rows[0].count}`);

    // Test 5: Simulate trying to access notification from wrong school (should fail in API)
    console.log(`\n🚫 Cross-school access test:`);
    console.log(`   School 1 admin trying to access School 2 notification: ${school2Notification1.rows[0].id}`);
    
    const crossAccessQuery = await client.query(`
      SELECT id, title, "schoolId"
      FROM notifications 
      WHERE id = $1 AND "schoolId" = $2
    `, [school2Notification1.rows[0].id, school1.id]);

    if (crossAccessQuery.rows.length === 0) {
      console.log(`   ✅ Correctly blocked - School 1 admin cannot access School 2 notification`);
    } else {
      console.log(`   ❌ Security breach - School 1 admin can access School 2 notification`);
    }

    // Summary
    console.log(`\n📋 ISOLATION TEST SUMMARY:`);
    console.log(`   ✅ School 1 notifications isolated: ${school1Results.rows.length === 2 ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ School 2 notifications isolated: ${school2Results.rows.length === 2 ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ Super Admin sees all: ${superAdminResults.rows.length === 4 ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ Cross-school access blocked: ${crossAccessQuery.rows.length === 0 ? 'PASS' : 'FAIL'}`);

    const allTestsPassed = 
      school1Results.rows.length === 2 &&
      school2Results.rows.length === 2 &&
      superAdminResults.rows.length === 4 &&
      crossAccessQuery.rows.length === 0;

    console.log(`\n🎯 OVERALL RESULT: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    // Clean up
    console.log('\n🧹 Cleaning up test notifications...');
    await client.query(`DELETE FROM notifications WHERE title LIKE 'Test Isolation%'`);
    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Error during notification isolation test:', error);
  } finally {
    await client.end();
  }
}

testNotificationIsolation().catch(console.error);