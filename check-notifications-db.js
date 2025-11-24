// Simple database query to check notifications
const { Client } = require('pg');

async function checkNotifications() {
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

    // Check if notifications table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications'
      );
    `);
    
    console.log('📋 Notifications table exists:', tableCheck.rows[0].exists);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Notifications table does not exist');
      return;
    }

    // Check table structure first
    const tableStructure = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications' 
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Notifications table structure:');
    tableStructure.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Check enum values
    const enumValues = await client.query(`
      SELECT n.nspname as enum_schema,
             t.typname as enum_name,
             e.enumlabel as enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname LIKE '%notification%'
      ORDER BY t.typname, e.enumsortorder;
    `);
    
    console.log('📋 Enum values:');
    enumValues.rows.forEach(row => {
      console.log(`  - ${row.enum_name}: ${row.enum_value}`);
    });

    // Check all notifications
    const allNotifications = await client.query('SELECT * FROM notifications ORDER BY "createdAt" DESC LIMIT 10');
    console.log(`🔔 Found ${allNotifications.rows.length} notifications:`);
    
    allNotifications.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.title} (${row.type}) - School: ${row.schoolId} - Read: ${row.read}`);
      console.log(`     Created: ${row.createdAt}`);
    });

    // Check schools table
    const schools = await client.query('SELECT id, name, code FROM schools LIMIT 5');
    console.log(`\n🏫 Found ${schools.rows.length} schools:`);
    schools.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.name} (${row.code}) - ID: ${row.id}`);
    });

    // Check what tables exist
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`\n📋 Available tables:`);
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Check the actual app user table specifically
    console.log(`\n👥 Checking application users from public schema:`);
    try {
      // Query the public.user table specifically
      const totalUsers = await client.query('SELECT COUNT(*) FROM public."user"');
      console.log(`  Total users in database: ${totalUsers.rows[0].count}`);
      
      // Get all admin users
      const adminUsers = await client.query('SELECT * FROM public."user" WHERE role IN (\'ADMIN\', \'SUPER_ADMIN\')');
      console.log(`  Found ${adminUsers.rows.length} admin users:`);
      adminUsers.rows.forEach((row, index) => {
        console.log(`    ${index + 1}. ${row.username} (${row.role}) - School: ${row.schoolId || 'None'} - Active: ${row.isActive}`);
      });
      
      // If no admin users, show some sample users
      if (adminUsers.rows.length === 0) {
        const sampleUsers = await client.query('SELECT * FROM public."user" LIMIT 5');
        console.log(`  Sample users (first 5):`);
        sampleUsers.rows.forEach((row, index) => {
          console.log(`    ${index + 1}. ${row.username} (${row.role}) - School: ${row.schoolId || 'None'} - Active: ${row.isActive}`);
        });
        
        // Check what roles exist
        const roles = await client.query('SELECT DISTINCT role FROM public."user"');
        console.log(`  Available roles in system:`, roles.rows.map(r => r.role));
      }
    } catch (error) {
      console.log(`  ❌ Error querying users: ${error.message}`);
    }

    // Create additional test notifications for different scenarios
    if (allNotifications.rows.length < 3) {
      console.log(`\n➕ Creating additional test notifications...`);
      
      // Create a school-specific notification
      const testSchool = schools.rows[0];
      const schoolNotification = await client.query(`
        INSERT INTO notifications (title, message, type, priority, "schoolId", metadata, read, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *;
      `, [
        'School-Specific Notification',
        `This notification is specifically for ${testSchool.name}`,
        'system',
        'medium',
        testSchool.id,
        JSON.stringify({ test: true, source: 'debug-school-specific' }),
        false
      ]);
      console.log('✅ School-specific notification created:', schoolNotification.rows[0].id);
      
      // Create a system-wide notification (no schoolId) for SUPER_ADMIN
      const systemNotification = await client.query(`
        INSERT INTO notifications (title, message, type, priority, "schoolId", metadata, read, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *;
      `, [
        'System-Wide Notification',
        'This is a system-wide notification that should be visible to all admins',
        'alert',
        'high',
        null, // No school ID - system wide
        JSON.stringify({ test: true, source: 'debug-system-wide' }),
        false
      ]);
      console.log('✅ System-wide notification created:', systemNotification.rows[0].id);
    }

    // Check final count
    const finalCount = await client.query('SELECT COUNT(*) FROM notifications');
    console.log(`\n📊 Total notifications in database: ${finalCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await client.end();
  }
}

checkNotifications().catch(console.error);