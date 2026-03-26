// database.js - Render PostgreSQL Configuration
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ===== RENDER POSTGRESQL CONNECTION =====
// Uses DATABASE_URL from Render environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render's PostgreSQL
  },
});

// Log connection info on startup (helpful for debugging)
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
    // Create participants table with all required fields
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

/**
 * Get a single row from the database
 * @param {string} sql - SQL query with $1, $2, etc. placeholders
 * @param {array} params - Parameters to pass to the query
 * @returns {object|null} - First row or null if not found
 */
export async function dbGet(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  } catch (err) {
    console.error("❌ Database query error:", err.message);
    throw err;
  }
}

/**
 * Get all rows from the database
 * @param {string} sql - SQL query with $1, $2, etc. placeholders
 * @param {array} params - Parameters to pass to the query
 * @returns {array} - Array of rows
 */
export async function dbAll(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error("❌ Database query error:", err.message);
    throw err;
  }
}

/**
 * Execute an INSERT, UPDATE, or DELETE query
 * @param {string} sql - SQL query with $1, $2, etc. placeholders
 * @param {array} params - Parameters to pass to the query
 */
export async function dbRun(sql, params = []) {
  try {
    await pool.query(sql, params);
  } catch (err) {
    console.error("❌ Database update error:", err.message);
    throw err;
  }
}

/**
 * Close the database connection pool gracefully
 */
export async function closeDb() {
  try {
    await pool.end();
    console.log("✅ Database pool closed gracefully.");
  } catch (err) {
    console.error("❌ Error closing database pool:", err.message);
  }
}

export default pool;