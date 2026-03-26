import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ===== TRUEHOST POSTGRESQL CONNECTION =====
// Replace with your actual cPanel database credentials
const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  database: process.env.DATABASE_NAME || 'ullfcdde_conference_db',
  user: process.env.DATABASE_USER || 'ullfcdde_conf_user',
  password: process.env.DATABASE_PASSWORD,
  // No SSL needed for localhost connections
});

export async function initializeDb() {
  console.log("🔵 Initializing database schema...");
  try {
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
    console.error("   Make sure your Truehost PostgreSQL credentials are correct:");
    console.error("   DATABASE_HOST:", process.env.DATABASE_HOST);
    console.error("   DATABASE_NAME:", process.env.DATABASE_NAME);
    console.error("   DATABASE_USER:", process.env.DATABASE_USER);
    process.exit(1);
  }
}

export async function dbGet(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  } catch (err) {
    console.error("Database query error:", err.message);
    throw err;
  }
}

export async function dbAll(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error("Database query error:", err.message);
    throw err;
  }
}

export async function dbRun(sql, params = []) {
  try {
    await pool.query(sql, params);
  } catch (err) {
    console.error("Database update error:", err.message);
    throw err;
  }
}

export async function closeDb() {
  await pool.end();
  console.log("Database pool closed.");
}