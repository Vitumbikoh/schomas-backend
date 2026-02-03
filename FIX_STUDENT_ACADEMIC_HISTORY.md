# Fix for "relation student_academic_history does not exist"

## Problem
The `student_academic_history` table doesn't exist in your database, causing the finance API endpoint to fail.

## Solution
Run the SQL script to create the table.

## Steps

### Option 1: Using psql command line
```bash
psql -U your_username -d your_database_name -f create-student-academic-history-table.sql
```

### Option 2: Using pgAdmin or Database GUI
1. Open your PostgreSQL database client (pgAdmin, DBeaver, etc.)
2. Connect to your database
3. Open and execute the file: `create-student-academic-history-table.sql`

### Option 3: Using Node.js script
Create a file `run-migration.js`:

```javascript
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'your_database_name',
  user: 'your_username',
  password: 'your_password'
});

async function runMigration() {
  const sql = fs.readFileSync('create-student-academic-history-table.sql', 'utf8');
  
  try {
    await pool.query(sql);
    console.log('✅ Table created successfully!');
  } catch (error) {
    console.error('❌ Error creating table:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
```

Then run:
```bash
node run-migration.js
```

## Verification

After running the script, verify the table was created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'student_academic_history';
```

Or check if you can query it:
```sql
SELECT COUNT(*) FROM student_academic_history;
```

## What This Table Does
This table preserves comprehensive historical records of students across academic terms, including:
- Student demographic information
- Financial records (fees, payments, outstanding)
- Academic performance
- Class and term associations
- Progression tracking (promotions, graduations)
