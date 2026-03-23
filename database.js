const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "conference.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("❌ Failed to open database:", err.message);
    process.exit(1);
  }
  console.log("✅ Database connected:", DB_PATH);
});

// Wait up to 15 seconds when locked before failing
db.configure("busyTimeout", 15000);

// Run these as sequential serialized operations so they
// never compete with each other at startup
db.serialize(() => {

  // WAL mode — allows concurrent reads + writes without locking
  db.run("PRAGMA journal_mode = WAL;", (err) => {
    if (err) console.warn("WAL pragma warning:", err.message);
  });

  db.run("PRAGMA synchronous = NORMAL;", (err) => {
    if (err) console.warn("Synchronous pragma warning:", err.message);
  });

  // Create table if it doesn't exist yet
  db.run(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      fullName TEXT,
      email TEXT,
      phone TEXT,
      country TEXT,
      organization TEXT,
      registrationType TEXT,
      excursion INTEGER DEFAULT 0,
      galaDinner INTEGER DEFAULT 0,
      amount REAL,
      paymentStatus TEXT DEFAULT 'pending',
      paymentReference TEXT,
      createdAt TEXT,
      checkedIn INTEGER DEFAULT 0,
      checkedInAt TEXT,
      checkedInBy TEXT
    )
  `, (err) => {
    if (err) console.error("❌ Create table error:", err.message);
  });

  // Add check-in columns to existing databases that predate this schema.
  // Each runs independently — errors are silently ignored because
  // "duplicate column" is expected on databases that already have them.
  const addColumn = (sql) => {
    db.run(sql, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.warn("Migration warning:", err.message);
      }
    });
  };

  addColumn("ALTER TABLE participants ADD COLUMN checkedIn INTEGER DEFAULT 0");
  addColumn("ALTER TABLE participants ADD COLUMN checkedInAt TEXT");
  addColumn("ALTER TABLE participants ADD COLUMN checkedInBy TEXT");

});

module.exports = db;