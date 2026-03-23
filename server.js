// Switched to ES Modules for modern import/export syntax
import express from "express";
import axios from "axios";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { Parser } from "json2csv";

// Import the new database helper functions
import { dbGet, dbAll, dbRun, initializeDb } from "./database.js";

// Import local modules
import generateTicket from "./tickets/generateTicket.js";
import sendTicketEmail from "./utils/sendTicketEmail.js";

// Load environment variables from .env file
dotenv.config();

/*
========================================
ASYNC SERVER STARTUP
This ensures the database is fully initialized
before the server starts accepting requests.
========================================
*/
async function startServer() {
  try {
    await initializeDb();
    console.log("Database is ready. Starting server...");

    const app = express();
    const PORT = process.env.PORT || 5000;
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    const WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET;
    const FRONTEND_URL = process.env.FRONTEND_URL.replace(/\/$/, "");
    const TICKETS_DIR = path.join(process.cwd(), "tickets");
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!fs.existsSync(TICKETS_DIR)) fs.mkdirSync(TICKETS_DIR, { recursive: true });

    /*
    ========================================
    ENVIRONMENT VALIDATION
    ========================================
    */
    const REQUIRED_ENV = [
      "PAYSTACK_SECRET_KEY",
      "FRONTEND_URL",
      "PAYSTACK_WEBHOOK_SECRET",
      "JWT_SECRET",
      "ADMIN_PASSWORD",
      "STAFF_PASSWORD",
    ];
    for (const key of REQUIRED_ENV) {
      if (!process.env[key]) {
        console.error(`❌ Missing required environment variable: ${key}`);
        process.exit(1);
      }
    }

    /*
    ========================================
    MIDDLEWARE
    ========================================
    */
    app.use(cors({
      origin: [FRONTEND_URL, /localhost/],
      methods: ["GET", "POST", "PATCH"],
    }));

    app.use((req, res, next) => {
      if (req.originalUrl === "/paystack-webhook") {
        express.raw({ type: "application/json" })(req, res, next);
      } else {
        express.json()(req, res, next);
      }
    });

    /*
    ========================================
    RATE LIMITERS
    ========================================
    */
    const paymentInitLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, max: 10,
      message: { error: "Too many payment requests. Please wait and try again." },
      standardHeaders: true, legacyHeaders: false,
    });

    const verifyLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, max: 20,
      message: { error: "Too many verification requests. Please wait and try again." },
      standardHeaders: true, legacyHeaders: false,
    });

    const adminLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, max: 120,
      message: { error: "Too many requests." },
      standardHeaders: true, legacyHeaders: false,
    });

    const loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, max: 10,
      message: { error: "Too many login attempts. Please wait 15 minutes." },
      standardHeaders: true, legacyHeaders: false,
    });

    /*
    ========================================
    AUTH MIDDLEWARE
    ========================================
    */
    const requireAuth = (allowedRoles = ["admin", "staff"]) => {
      return (req, res, next) => {
        const authHeader = req.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({ error: "No token provided. Please log in." });
        }
        const token = authHeader.split(" ")[1];
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (!allowedRoles.includes(decoded.role)) {
            return res.status(403).json({ error: "Access denied for your role." });
          }
          req.user = decoded;
          next();
        } catch (err) {
          if (err.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Session expired. Please log in again.", expired: true });
          }
          return res.status(401).json({ error: "Invalid token. Please log in again." });
        }
      };
    };

    /*
    ========================================
    TICKET HELPER — regenerate if missing
    ========================================
    */
    async function ensureTicketExists(participant) {
      const ticketPath = path.join(TICKETS_DIR, participant.id + ".pdf");
      if (!fs.existsSync(ticketPath)) {
        console.log("🔄 Regenerating missing ticket for:", participant.id);
        await generateTicket(participant);
      }
      return ticketPath;
    }

    /*
    ========================================
    PAYMENT PROCESSING HELPER
    ========================================
    */
    async function processSuccessfulPayment(participantId, reference) {
      await dbRun(
        `UPDATE participants SET paymentStatus = $1, paymentReference = $2 WHERE id = $3`,
        ["paid", reference, participantId]
      );
      const participant = await dbGet(`SELECT * FROM participants WHERE id = $1`, [participantId]);
      if (!participant) throw new Error(`Participant not found: ${participantId}`);
      const ticketPath = await generateTicket(participant);
      console.log("🎫 Ticket generated:", ticketPath);
      await sendTicketEmail(participant, ticketPath);
      console.log("📧 Email sent to:", participant.email);
      return participant;
    }

    /*
    ========================================
    TEST ROUTE
    ========================================
    */
    app.get("/", (req, res) => res.send("Conference Payment Server Running"));

    /*
    ========================================
    AUTH: LOGIN
    ========================================
    */
    app.post("/auth/login", loginLimiter, (req, res) => {
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: "Password is required." });
      let role = null;
      if (password === process.env.ADMIN_PASSWORD) role = "admin";
      else if (password === process.env.STAFF_PASSWORD) role = "staff";
      if (!role) return res.status(401).json({ error: "Incorrect password." });
      const token = jwt.sign({ role }, JWT_SECRET, { expiresIn: "8h" });
      console.log(`🔐 Login: ${role} at ${new Date().toISOString()}`);
      res.json({ token, role, expiresIn: 8 * 60 * 60 });
    });

    /*
    ========================================
    AUTH: VERIFY TOKEN
    ========================================
    */
    app.get("/auth/verify", requireAuth(["admin", "staff"]), (req, res) => {
      res.json({ valid: true, role: req.user.role });
    });

    /*
    ========================================
    INITIALIZE PAYMENT
    ========================================
    */
    app.post("/initialize-payment", paymentInitLimiter, async (req, res) => {
      const { email, amount, name, metadata } = req.body;
      if (!email || !amount || !name) return res.status(400).json({ error: "email, amount, and name are required" });
      if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "amount must be a positive number" });

      const registrationType = metadata?.registrationType || "";
      const existing = await dbGet(
        `SELECT id FROM participants WHERE email = $1 AND registrationType = $2 AND paymentStatus = 'paid'`,
        [email.toLowerCase().trim(), registrationType]
      ).catch(() => null);

      if (existing) return res.status(409).json({ error: "A paid registration already exists for this email and registration type.", code: "DUPLICATE_REGISTRATION" });

      const participantId = uuidv4();
      try {
        await dbRun(
          `INSERT INTO participants (id, fullName, email, phone, country, organization, registrationType, excursion, galaDinner, amount, paymentStatus, createdAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            participantId, name, email.toLowerCase().trim(),
            metadata?.phone || "", metadata?.country || "",
            metadata?.organization || "", registrationType,
            metadata?.excursion ? true : false, metadata?.galaDinner ? true : false,
            amount, "pending", new Date().toISOString(),
          ]
        );

        const response = await axios.post(
          "https://api.paystack.co/transaction/initialize",
          { email, amount: amount * 100, metadata: { participantId }, callback_url: `${FRONTEND_URL}/payment-success` },
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } }
        );
        res.json(response.data.data);
      } catch (error) {
        await dbRun(`UPDATE participants SET paymentStatus = $1 WHERE id = $2`, ["failed", participantId]).catch(() => {});
        console.error("Payment init error:", error.response?.data || error.message);
        res.status(500).json({ error: "Payment initialization failed" });
      }
    });

    /*
    ========================================
    PAYMENT VERIFICATION
    ========================================
    */
    app.post("/verify-payment", verifyLimiter, async (req, res) => {
      const { reference } = req.body;
      if (!reference) return res.status(400).json({ error: "reference is required" });
      try {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
        const data = response.data;
        if (data.status && data.data.status === "success") {
          const participantId = data.data.metadata.participantId;
          const existing = await dbGet(`SELECT paymentStatus FROM participants WHERE id = $1`, [participantId]);
          if (existing?.paymentStatus === "paid") return res.json({ status: "success", participantId, alreadyProcessed: true });
          await processSuccessfulPayment(participantId, reference);
          res.json({ status: "success", participantId });
        } else {
          res.json({ status: "failed" });
        }
      } catch (error) {
        console.error("Verification error:", error.response?.data || error.message);
        res.status(500).json({ error: "Payment verification failed" });
      }
    });

    /*
    ========================================
    PAYSTACK WEBHOOK
    ========================================
    */
    app.post("/paystack-webhook", async (req, res) => {
      const hash = crypto.createHmac("sha512", WEBHOOK_SECRET).update(req.body).digest("hex");
      if (hash !== req.headers["x-paystack-signature"]) { console.warn("⚠️ Invalid webhook signature"); return res.sendStatus(401); }
      res.sendStatus(200);
      let event;
      try { event = JSON.parse(req.body); } catch { console.error("❌ Failed to parse webhook"); return; }
      if (event.event !== "charge.success") return;
      const reference = event.data.reference;
      const participantId = event.data.metadata?.participantId;
      if (!participantId) { console.error("❌ Webhook missing participantId"); return; }
      try {
        const existing = await dbGet(`SELECT paymentStatus FROM participants WHERE id = $1`, [participantId]);
        if (existing?.paymentStatus === "paid") { console.log("⚠️ Already processed:", participantId); return; }
        await processSuccessfulPayment(participantId, reference);
      } catch (error) { console.error("❌ Webhook error:", error.message); }
    });

    /*
    ========================================
    TICKET PREVIEW
    ========================================
    */
    app.get("/ticket/:participantId", async (req, res) => {
      const safeId = path.basename(req.params.participantId);
      try {
        const participant = await dbGet(`SELECT * FROM participants WHERE id = $1 AND paymentStatus = 'paid'`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Ticket not found" });
        const ticketPath = await ensureTicketExists(participant);
        res.setHeader("Content-Type", "application/pdf");
        res.sendFile(ticketPath, (err) => { if (err && !res.headersSent) res.status(404).json({ error: "Ticket not found" }); });
      } catch (err) { if (!res.headersSent) res.status(500).json({ error: "Could not load ticket" }); }
    });

    /*
    ========================================
    TICKET DOWNLOAD
    ========================================
    */
    app.get("/ticket-download/:participantId", async (req, res) => {
      const safeId = path.basename(req.params.participantId);
      try {
        const participant = await dbGet(`SELECT * FROM participants WHERE id = $1 AND paymentStatus = 'paid'`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Ticket not found" });
        const ticketPath = await ensureTicketExists(participant);
        res.download(ticketPath, "conference-ticket-" + safeId + ".pdf", (err) => { if (err && !res.headersSent) res.status(404).json({ error: "Ticket not found" }); });
      } catch (err) { if (!res.headersSent) res.status(500).json({ error: "Could not download ticket" }); }
    });

    /*
    ========================================
    VERIFY TICKET (public)
    ========================================
    */
    app.get("/verify-ticket/:participantId", async (req, res) => {
      const safeId = path.basename(req.params.participantId);
      try {
        const participant = await dbGet(
          `SELECT id, fullName, email, country, organization, registrationType, excursion, galaDinner, amount, paymentStatus, checkedIn, checkedInAt, checkedInBy FROM participants WHERE id = $1`,
          [safeId]
        );
        if (!participant) return res.status(404).json({ valid: false, error: "Participant not found" });
        if (participant.paymentStatus !== "paid") return res.json({ valid: false, error: "Payment not confirmed", paymentStatus: participant.paymentStatus });
        res.json({
          valid: true,
          participant: {
            id: participant.id, fullName: participant.fullName, email: participant.email, country: participant.country, organization: participant.organization, registrationType: participant.registrationType,
            excursion: !!participant.excursion, galaDinner: !!participant.galaDinner, amount: participant.amount, checkedIn: !!participant.checkedIn, checkedInAt: participant.checkedInAt, checkedInBy: participant.checkedInBy,
          },
        });
      } catch (err) { res.status(500).json({ valid: false, error: "Server error" }); }
    });

    /*
    ========================================
    CHECK IN
    ========================================
    */
    app.patch("/checkin/:participantId", requireAuth(["admin", "staff"]), async (req, res) => {
      const safeId = path.basename(req.params.participantId);
      const staffName = req.body?.staffName || req.user.role;
      try {
        const participant = await dbGet(`SELECT id, fullName, paymentStatus, checkedIn FROM participants WHERE id = $1`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Participant not found" });
        if (participant.paymentStatus !== "paid") return res.status(400).json({ error: "Cannot check in — payment not confirmed" });
        if (participant.checkedIn) return res.status(409).json({ error: "Already checked in", alreadyCheckedIn: true });
        await dbRun(`UPDATE participants SET checkedIn = $1, checkedInAt = $2, checkedInBy = $3 WHERE id = $4`, [true, new Date().toISOString(), staffName, safeId]);
        console.log(`✅ Checked in: ${participant.fullName} by ${staffName}`);
        res.json({ success: true, message: `${participant.fullName} checked in successfully` });
      } catch (err) { console.error("Check-in error:", err.message); res.status(500).json({ error: "Check-in failed" }); }
    });

    /*
    ========================================
    ADMIN: PARTICIPANTS LIST
    ========================================
    */
    app.get("/admin/participants", adminLimiter, requireAuth(["admin"]), async (req, res) => {
      try {
        const { status, type } = req.query;
        let sql = `SELECT * FROM participants`;
        const params = [];
        const conditions = [];
        if (status) { conditions.push(`paymentStatus = $${params.length + 1}`); params.push(status); }
        if (type) { conditions.push(`registrationType = $${params.length + 1}`); params.push(type); }
        if (conditions.length) sql += ` WHERE ` + conditions.join(" AND ");
        sql += ` ORDER BY createdAt DESC`;
        const rows = await dbAll(sql, params);
        res.json(rows);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /*
    ========================================
    ADMIN: EXPORT CSV
    ========================================
    */
    app.get("/admin/export", adminLimiter, requireAuth(["admin"]), async (req, res) => {
      try {
        const { status, type } = req.query;
        let sql = `SELECT * FROM participants`;
        const params = [];
        const conditions = [];
        if (status) { conditions.push(`paymentStatus = $${params.length + 1}`); params.push(status); }
        if (type) { conditions.push(`registrationType = $${params.length + 1}`); params.push(type); }
        if (conditions.length) sql += ` WHERE ` + conditions.join(" AND ");
        sql += ` ORDER BY createdAt DESC`;
        const rows = await dbAll(sql, params);
        if (rows.length === 0) return res.status(404).json({ error: "No participants found" });
        const parser = new Parser();
        const csv = parser.parse(rows);
        res.header("Content-Type", "text/csv");
        res.attachment("participants.csv");
        res.send(csv);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /*
    ========================================
    ADMIN: RESEND TICKET
    ========================================
    */
    app.post("/admin/resend-ticket/:participantId", adminLimiter, requireAuth(["admin"]), async (req, res) => {
      const safeId = path.basename(req.params.participantId);
      try {
        const participant = await dbGet(`SELECT * FROM participants WHERE id = $1 AND paymentStatus = 'paid'`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Participant not found or payment not confirmed" });
        const ticketPath = await generateTicket(participant);
        await sendTicketEmail(participant, ticketPath);
        res.json({ success: true, message: "Ticket resent to " + participant.email });
      } catch (error) { res.status(500).json({ error: "Failed to resend: " + error.message }); }
    });

    /*
    ========================================
    ADMIN: STATS
    ========================================
    */
    app.get("/admin/stats", adminLimiter, requireAuth(["admin", "staff"]), async (req, res) => {
      try {
        const [total, paid, pending, failed, checkedIn, byType, revenue] = await Promise.all([
          dbGet(`SELECT COUNT(*) as count FROM participants`),
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE paymentStatus = 'paid'`),
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE paymentStatus = 'pending'`),
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE paymentStatus = 'failed'`),
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE checkedIn = $1`, [true]),
          dbAll(`SELECT registrationType, COUNT(*) as count FROM participants WHERE paymentStatus = 'paid' GROUP BY registrationType`),
          dbGet(`SELECT SUM(amount) as total FROM participants WHERE paymentStatus = 'paid'`),
        ]);
        res.json({
          registrations: { total: total.count, paid: paid.count, pending: pending.count, failed: failed.count, checkedIn: checkedIn.count, },
          byType: byType.reduce((acc, row) => { acc[row.registrationType || "unknown"] = row.count; return acc; }, {}),
          totalRevenue: revenue.total || 0,
        });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /*
    ========================================
    ADMIN: UNDO CHECK-IN
    ========================================
    */
    app.patch("/admin/undo-checkin/:participantId", adminLimiter, requireAuth(["admin"]), async (req, res) => {
      const safeId = path.basename(req.params.participantId);
      try {
        const participant = await dbGet(`SELECT id, fullName FROM participants WHERE id = $1`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Participant not found" });
        await dbRun(`UPDATE participants SET checkedIn = $1, checkedInAt = NULL, checkedInBy = NULL WHERE id = $2`, [false, safeId]);
        res.json({ success: true, message: `Check-in reversed for ${participant.fullName}` });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /*
    ========================================
    START SERVER
    ========================================
    */
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();