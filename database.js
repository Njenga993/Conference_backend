import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Use the DATABASE_URL provided by Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render's PostgreSQL
  },
});

// A simple function to initialize the database schema
export async function initializeDb() {
  console.log("🔵 Initializing database schema...");
  try {
    // Create the participants table if it doesn't exist
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

    // Add new columns if they don't exist (for migrations)
    const client = await pool.connect();
    try {
      // Check for 'checkedIn' column
      const checkInResult = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'participants' AND column_name = 'checkedIn'
      `);
      if (checkInResult.rows.length === 0) {
        await client.query(`ALTER TABLE participants ADD COLUMN checkedIn BOOLEAN DEFAULT FALSE`);
        console.log("✅ Added 'checkedIn' column.");
      }

      // Check for 'checkedInAt' column
      const checkInAtResult = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'participants' AND column_name = 'checkedInAt'
      `);
      if (checkInAtResult.rows.length === 0) {
        await client.query(`ALTER TABLE participants ADD COLUMN checkedInAt TIMESTAMPTZ`);
        console.log("✅ Added 'checkedInAt' column.");
      }
      
      // Check for 'checkedInBy' column
      const checkInByResult = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'participants' AND column_name = 'checkedInBy'
      `);
      if (checkInByResult.rows.length === 0) {
        await client.query(`ALTER TABLE participants ADD COLUMN checkedInBy TEXT`);
        console.log("✅ Added 'checkedInBy' column.");
      }

    } finally {
      client.release(); // Release the client back to the pool
    }

    console.log("🟢 Database initialization complete.");
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    // Exit if we can't set up the database, as the app can't function.
    process.exit(1);
  }
}

// Wrapper functions to mimic the 'sqlite3' API
// This makes the migration to server.js much easier!

// For a single row (like db.get)
export async function dbGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null; // Return null if no row found
}

// For all rows (like db.all)
export async function dbAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// For insert, update, delete (like db.run)
export async function dbRun(sql, params = []) {
  await pool.query(sql, params);
}

// Optional: A function to close the pool gracefully
export async function closeDb() {
  await pool.end();
  console.log("Database pool closed.");
}