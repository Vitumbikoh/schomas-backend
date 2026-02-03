// Run this script to create the student_academic_history table
// Usage: node create-academic-history-table.js

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration - update these values based on your .env file
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'schomas',
};

async function createTable() {
  const client = new Client(dbConfig);
  
  try {
    console.log('🔌 Connecting to database...');
    console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}`);
    console.log('');
    
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Read SQL file
    const sqlFile = path.join(__dirname, 'create-student-academic-history-table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📝 Executing SQL script...');
    await client.query(sql);
    console.log('✅ Table created successfully!\n');
    
    // Verify table exists
    console.log('🔍 Verifying table creation...');
    const result = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'student_academic_history') as column_count
      FROM information_schema.tables 
      WHERE table_name = 'student_academic_history'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Verification successful!');
      console.log(`   Table: ${result.rows[0].table_name}`);
      console.log(`   Columns: ${result.rows[0].column_count}`);
    } else {
      console.log('⚠️  Table not found after creation (this should not happen)');
    }
    
    // Check record count
    const countResult = await client.query('SELECT COUNT(*) as count FROM student_academic_history');
    console.log(`   Current records: ${countResult.rows[0].count}\n`);
    
    console.log('✅ All done! The student_academic_history table is ready to use.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check your database credentials in .env file');
    console.error('2. Make sure PostgreSQL is running');
    console.error('3. Verify the database exists');
    console.error('\nYou can also run the SQL manually:');
    console.error('   psql -U postgres -d schomas -f create-student-academic-history-table.sql');
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Check if pg module is available
try {
  require.resolve('pg');
  createTable();
} catch (e) {
  console.error('❌ The "pg" module is not installed.');
  console.error('Please install it with: npm install pg');
  console.error('\nOr run the SQL file manually:');
  console.error('   psql -U postgres -d schomas -f create-student-academic-history-table.sql');
  process.exit(1);
}
