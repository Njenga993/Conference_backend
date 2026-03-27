// database.js - Render PostgreSQL Configuration
// This version automatically adds missing columns to existing tables
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('connect', () => {
  console.log("✅ Connected to Render PostgreSQL");
});

pool.on('error', (err) => {
  console.error("❌ Unexpected error on idle client", err);
  process.exit(-1);
});

export async function initializeDb() {
  console.log("🔵 Initializing database schema...");
  try {
    // Step 1: Create table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        fullName TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        dialCode TEXT,
        country TEXT,
        organization TEXT,
        position TEXT,
        category TEXT,
        registrationType TEXT,
        excursion BOOLEAN DEFAULT FALSE,
        galaDinner BOOLEAN DEFAULT FALSE,
        amount NUMERIC(10, 2),
        paymentStatus TEXT DEFAULT 'pending',
        paymentReference TEXT,
        hearAbout TEXT,
        dietaryRestrictions TEXT,
        accommodation TEXT,
        specialNeeds TEXT,
        createdAt TIMESTAMPTZ DEFAULT NOW(),
        checkedIn BOOLEAN DEFAULT FALSE,
        checkedInAt TIMESTAMPTZ,
        checkedInBy TEXT
      )
    `);
    console.log("✅ Table structure verified.");

    // Step 2: Add missing columns if they don't exist
    // This allows us to update the database without losing existing data
    const columnsToAdd = [
      { name: 'dialCode', type: 'TEXT' },
      { name: 'position', type: 'TEXT' },
      { name: 'category', type: 'TEXT' },
      { name: 'hearAbout', type: 'TEXT' },
      { name: 'dietaryRestrictions', type: 'TEXT' },
      { name: 'accommodation', type: 'TEXT' },
      { name: 'specialNeeds', type: 'TEXT' },
    ];

    for (const column of columnsToAdd) {
      try {
        // Try to add the column - if it exists, this will fail silently
        await pool.query(`
          ALTER TABLE participants
          ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
        `);
        console.log(`✅ Column '${column.name}' added or already exists.`);
      } catch (err) {
        // Column might already exist - this is fine
        if (!err.message.includes('already exists')) {
          console.warn(`⚠️ Issue with column '${column.name}':`, err.message);
        }
      }
    }

    console.log("✅ 'participants' table is ready with all fields.");
    console.log("🟢 Database initialization complete.");
    
  } catch (err) {
    console.error("❌ Database initialization failed:", err.message);
    console.error("   Troubleshooting:");
    console.error("   1. Make sure DATABASE_URL is set in Render environment");
    console.error("   2. Check that the PostgreSQL database is active");
    console.error("   3. Verify connection string format:");
    console.error("      postgresql://user:password@host:port/database");
    process.exit(1);
  }
}

export async function dbGet(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  } catch (err) {
    console.error("❌ Database query error:", err.message);
    throw err;
  }
}

export async function dbAll(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error("❌ Database query error:", err.message);
    throw err;
  }
}

export async function dbRun(sql, params = []) {
  try {
    await pool.query(sql, params);
  } catch (err) {
    console.error("❌ Database update error:", err.message);
    throw err;
  }
}

export async function closeDb() {
  try {
    await pool.end();
    console.log("✅ Database pool closed gracefully.");
  } catch (err) {
    console.error("❌ Error closing database pool:", err.message);
  }
}

export default pool;