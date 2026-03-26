import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function initializeDb() {
  console.log("🔵 Initializing database schema...");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        fullName TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        country TEXT,
        organization TEXT,
        registrationType TEXT,
        excursion BOOLEAN DEFAULT FALSE,
        galaDinner BOOLEAN DEFAULT FALSE,
        amount NUMERIC(10, 2),
        paymentStatus TEXT DEFAULT 'pending',
        paymentReference TEXT,
        createdAt TIMESTAMPTZ DEFAULT NOW(),
        checkedIn BOOLEAN DEFAULT FALSE,
        checkedInAt TIMESTAMPTZ,
        checkedInBy TEXT
      )
    `);
    console.log("✅ 'participants' table is ready.");
    console.log("🟢 Database initialization complete.");
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    process.exit(1);
  }
}

export async function dbGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

export async function dbAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function dbRun(sql, params = []) {
  await pool.query(sql, params);
}

export async function closeDb() {
  await pool.end();
  console.log("Database pool closed.");
}