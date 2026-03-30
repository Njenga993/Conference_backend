// server.js - Complete with Multi-Currency Support
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

// Import the database helper functions
import { dbGet, dbAll, dbRun, initializeDb } from "./database.js";

// Import local modules
import generateTicket from "./tickets/generateTicket.js";
import sendTicketEmail from "./utils/sendTicketEmail.js";

// Load environment variables from .env file
dotenv.config();

/*
========================================
EXCHANGE RATE HELPER
Fetches live USD to KES rate, with fallback
========================================
*/
const getUSDToKESRate = async () => {
  try {
    // Try frankfurter.app (free, no key required)
    const response = await axios.get('https://api.frankfurter.app/latest?from=USD&to=KES', {
      timeout: 5000
    });
    const rate = response.data.rates?.KES;
    if (rate && rate > 0) {
      console.log(`💱 Live exchange rate: 1 USD = ${rate.toFixed(2)} KES`);
      return rate;
    }
  } catch (err) {
    console.warn(`⚠️ Frankfurter API failed: ${err.message}`);
  }

  // Fallback rates (update these periodically)
  console.log(`💱 Using fallback exchange rate: 1 USD = 130 KES`);
  return 130;
};

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
    
    // Trust proxy for Render deployment
    app.set('trust proxy', 1);
    
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
      "DATABASE_URL",
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
      windowMs: 15 * 60 * 1000, 
      max: 10,
      message: { error: "Too many payment requests. Please wait and try again." },
      standardHeaders: true, 
      legacyHeaders: false,
    });

    const verifyLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, 
      max: 20,
      message: { error: "Too many verification requests. Please wait and try again." },
      standardHeaders: true, 
      legacyHeaders: false,
    });

    const adminLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, 
      max: 120,
      message: { error: "Too many requests." },
      standardHeaders: true, 
      legacyHeaders: false,
    });

    const loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, 
      max: 10,
      message: { error: "Too many login attempts. Please wait 15 minutes." },
      standardHeaders: true, 
      legacyHeaders: false,
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
    WITH DETAILED DEBUG LOGGING
    ALL COLUMN NAMES IN LOWERCASE
    ========================================
    */
    async function processSuccessfulPayment(participantId, reference) {
      console.log(`\n${"=".repeat(70)}`);
      console.log(`Processing payment for participant: ${participantId}`);
      console.log(`${"=".repeat(70)}`);
      
      // Step 1: Get the participant (all column names in lowercase)
      console.log(`[STEP 1] Fetching participant from database...`);
      const participant = await dbGet(
        `SELECT id, fullname, email, paymentstatus, paymentreference FROM participants WHERE id = $1`, 
        [participantId]
      );
      
      if (!participant) {
        console.error(`❌ [ERROR] Participant not found in database: ${participantId}`);
        throw new Error(`Participant not found in database: ${participantId}`);
      }
      
      console.log(`✅ Participant found:`);
      console.log(`   - Name: ${participant.fullname}`);
      console.log(`   - Email: ${participant.email}`);
      console.log(`   - Current paymentstatus: "${participant.paymentstatus}"`);
      console.log(`   - Current paymentreference: "${participant.paymentreference}"`);
      
      // Step 2: Update payment status (using lowercase column names)
      console.log(`\n[STEP 2] Updating payment status in database...`);
      console.log(`   SQL: UPDATE participants SET paymentstatus = 'paid', paymentreference = '${reference}' WHERE id = '${participantId}'`);
      
      try {
        await dbRun(
          `UPDATE participants SET paymentstatus = $1, paymentreference = $2 WHERE id = $3`,
          ["paid", reference, participantId]
        );
        console.log(`✅ UPDATE query executed successfully`);
      } catch (updateErr) {
        console.error(`❌ [CRITICAL ERROR] UPDATE FAILED for ${participantId}`);
        console.error(`   Error message: ${updateErr.message}`);
        console.error(`   Error code: ${updateErr.code}`);
        throw updateErr;
      }
      
      // Step 3: Verify the update was successful
      console.log(`\n[STEP 3] Verifying update was successful...`);
      console.log(`   SQL: SELECT paymentstatus, paymentreference FROM participants WHERE id = '${participantId}'`);
      
      const updated = await dbGet(
        `SELECT paymentstatus, paymentreference FROM participants WHERE id = $1`, 
        [participantId]
      );
      
      if (!updated) {
        console.error(`❌ [CRITICAL ERROR] Participant disappeared after UPDATE!`);
        throw new Error(`Participant not found after UPDATE`);
      }
      
      console.log(`✅ Database verification complete:`);
      console.log(`   - paymentstatus is now: "${updated.paymentstatus}"`);
      console.log(`   - paymentreference is now: "${updated.paymentreference}"`);
      
      if (updated.paymentstatus !== "paid") {
        console.error(`\n❌ [CRITICAL ERROR] Payment status is still "${updated.paymentstatus}" after UPDATE!`);
        console.error(`   This means the UPDATE query did not change the value`);
        console.error(`   Check: database constraints, row permissions, data type issues`);
        
        // Attempt direct update as fallback
        console.log(`\n   Attempting direct SQL update as fallback...`);
        try {
          await dbRun(`UPDATE participants SET paymentstatus = 'paid' WHERE id = $1`, [participantId]);
          const finalCheck = await dbGet(`SELECT paymentstatus FROM participants WHERE id = $1`, [participantId]);
          console.log(`   Fallback result: paymentstatus = "${finalCheck?.paymentstatus}"`);
        } catch (fallbackErr) {
          console.error(`   Fallback also failed: ${fallbackErr.message}`);
        }
      } else {
        console.log(`✅ [SUCCESS] Payment status correctly updated to "paid"`);
      }
      
      // Step 4: Generate ticket - need to get full participant data with lowercase column names
      console.log(`\n[STEP 4] Generating conference ticket...`);
      const fullParticipant = await dbGet(
        `SELECT * FROM participants WHERE id = $1`, 
        [participantId]
      );
      
      // Map database column names to what generateTicket expects
      const participantForTicket = {
        id: fullParticipant.id,
        fullName: fullParticipant.fullname,
        email: fullParticipant.email,
        phone: fullParticipant.phone,
        dialCode: fullParticipant.dialcode,
        country: fullParticipant.country,
        organization: fullParticipant.organization,
        position: fullParticipant.position,
        category: fullParticipant.category,
        registrationType: fullParticipant.registrationtype,
        excursion: fullParticipant.excursion,
        galaDinner: fullParticipant.galadinner,
        amount: fullParticipant.amount,
        paymentStatus: fullParticipant.paymentstatus,
        paymentReference: fullParticipant.paymentreference,
        hearAbout: fullParticipant.hearabout,
        dietaryRestrictions: fullParticipant.dietaryrestrictions,
        accommodation: fullParticipant.accommodation,
        specialNeeds: fullParticipant.specialneeds,
        createdAt: fullParticipant.createdat,
        checkedIn: fullParticipant.checkedin,
        checkedInAt: fullParticipant.checkedinat,
        checkedInBy: fullParticipant.checkedinby
      };
      
      const ticketPath = await generateTicket(participantForTicket);
      console.log(`🎫 Ticket generated at: ${ticketPath}`);
      
      // Step 5: Send email asynchronously (don't block payment confirmation)
      console.log(`\n[STEP 5] Sending confirmation email (async, non-blocking)...`);
      sendTicketEmail(participantForTicket, ticketPath)
        .then(() => {
          console.log(`📧 Email sent successfully to: ${participant.email}`);
        })
        .catch((err) => {
          console.error(`⚠️ Email send failed (async, non-blocking): ${err.message}`);
          console.error(`   Participant: ${participant.email} | ID: ${participantId}`);
          console.error(`   Note: Payment was confirmed, but email failed. User can resend later.`);
        });
      
      console.log(`${"=".repeat(70)}\n`);
      return participantForTicket;
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
    🌍 NOW WITH MULTI-CURRENCY USD → KES CONVERSION
    ========================================
    */
    app.post("/initialize-payment", paymentInitLimiter, async (req, res) => {
      const { email, amount, name, metadata } = req.body;
      if (!email || !amount || !name) return res.status(400).json({ error: "email, amount, and name are required" });
      if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "amount must be a positive number" });

      const registrationType = metadata?.registrationType || "";
      const selectedCurrency = metadata?.currency || "USD";  // Get currency from frontend
      
      const existing = await dbGet(
        `SELECT id FROM participants WHERE email = $1 AND registrationtype = $2 AND paymentstatus = 'paid'`,
        [email.toLowerCase().trim(), registrationType]
      ).catch(() => null);

      if (existing) return res.status(409).json({ error: "A paid registration already exists for this email and registration type.", code: "DUPLICATE_REGISTRATION" });

      const participantId = uuidv4();
      
      try {
        // 💱 MULTI-CURRENCY: Convert USD to KES dynamically
        let amountInKES = amount;
        if (selectedCurrency !== "KES") {
          const exchangeRate = await getUSDToKESRate();
          amountInKES = amount * exchangeRate;
          console.log(`💱 Currency conversion: ${amount} USD × ${exchangeRate} = ${amountInKES.toFixed(2)} KES`);
        }

        // Round to nearest KES
        const amountInKesCents = Math.round(amountInKES * 100);

        // INSERT ALL FIELDS FROM REGISTRATION FORM (all lowercase column names)
        await dbRun(
          `INSERT INTO participants (
            id, fullname, email, phone, dialcode, country, organization, position, 
            category, registrationtype, excursion, galadinner, amount, paymentstatus, 
            createdat, hearabout, dietaryrestrictions, accommodation, specialneeds
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )`,
          [
            participantId,
            name,
            email.toLowerCase().trim(),
            metadata?.phone || "",
            metadata?.dialCode || "",
            metadata?.country || "",
            metadata?.organization || "",
            metadata?.position || "",
            metadata?.category || "",
            registrationType,
            metadata?.excursion ? true : false,
            metadata?.galaDinner ? true : false,
            Math.round(amountInKES),  // Store in KES in database
            "pending",
            new Date().toISOString(),
            metadata?.hearAbout || "",
            metadata?.dietaryRestrictions || "",
            metadata?.accommodation || "",
            metadata?.specialNeeds || ""
          ]
        );
        
        console.log(`✅ Participant created in DB: ${participantId}`);
        console.log(`   Name: ${name}`);
        console.log(`   Email: ${email}`);
        console.log(`   Type: ${registrationType}`);
        console.log(`   Amount: ${amountInKES.toFixed(2)} KES (from ${amount} ${selectedCurrency})`);

        // Send to Paystack in KES
        const response = await axios.post(
          "https://api.paystack.co/transaction/initialize",
          { 
            email, 
            amount: amountInKesCents,  // Paystack expects amount in kobo (cents)
            metadata: { 
              participantId,
              originalAmount: amount,     // Store original USD amount
              originalCurrency: selectedCurrency,  // Store original currency
              exchangeRate: amountInKES / amount   // Store rate used
            },
            callback_url: `${FRONTEND_URL}/payment-success` 
          },
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } }
        );
        
        console.log(`✅ Paystack initialized for ${participantId}:`, response.data.data.reference);
        res.json(response.data.data);
      } catch (error) {
        await dbRun(`UPDATE participants SET paymentstatus = $1 WHERE id = $2`, ["failed", participantId]).catch(() => {});
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
      
      console.log(`🔍 Verifying payment with reference: ${reference}`);
      
      try {
        const response = await axios.get(
          `https://api.paystack.co/transaction/verify/${reference}`, 
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
        );
        
        const data = response.data;
        console.log(`Paystack response status: ${data.status}, transaction status: ${data.data?.status}`);
        
        if (data.status && data.data.status === "success") {
          const participantId = data.data.metadata?.participantId;
          
          if (!participantId) {
            console.error("❌ Paystack response missing participantId in metadata");
            return res.status(500).json({ error: "Payment verification failed: Missing participant information" });
          }
          
          console.log(`✅ Payment verified for participant: ${participantId}`);
          
          const existing = await dbGet(`SELECT paymentstatus FROM participants WHERE id = $1`, [participantId]);
          if (!existing) {
            console.error(`❌ Participant not found in database: ${participantId}`);
            return res.status(404).json({ error: "Participant not found. Please contact support." });
          }
          
          if (existing.paymentstatus === "paid") {
            console.log(`⚠️ Payment already processed for ${participantId}`);
            return res.json({ status: "success", participantId, alreadyProcessed: true });
          }
          
          await processSuccessfulPayment(participantId, reference);
          res.json({ status: "success", participantId });
        } else {
          console.log(`Payment verification failed for reference: ${reference}`);
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
      if (hash !== req.headers["x-paystack-signature"]) { 
        console.warn("⚠️ Invalid webhook signature"); 
        return res.sendStatus(401); 
      }
      res.sendStatus(200);
      
      let event;
      try { 
        event = JSON.parse(req.body); 
      } catch { 
        console.error("❌ Failed to parse webhook"); 
        return; 
      }
      
      if (event.event !== "charge.success") return;
      
      const reference = event.data.reference;
      const participantId = event.data.metadata?.participantId;
      
      if (!participantId) { 
        console.error("❌ Webhook missing participantId"); 
        return; 
      }
      
      try {
        const existing = await dbGet(`SELECT paymentstatus FROM participants WHERE id = $1`, [participantId]);
        if (!existing) {
          console.error(`❌ Webhook: Participant not found: ${participantId}`);
          return;
        }
        
        if (existing.paymentstatus === "paid") { 
          console.log("⚠️ Already processed:", participantId); 
          return; 
        }
        
        await processSuccessfulPayment(participantId, reference);
        console.log(`✅ Webhook processed payment for: ${participantId}`);
      } catch (error) { 
        console.error("❌ Webhook error:", error.message); 
      }
    });

    /*
    ========================================
    TICKET PREVIEW
    ========================================
    */
    app.get("/ticket/:participantId", async (req, res) => {
      const safeId = path.basename(req.params.participantId);
      try {
        const participant = await dbGet(`SELECT * FROM participants WHERE id = $1 AND paymentstatus = 'paid'`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Ticket not found" });
        
        // Map database columns to what ensureTicketExists expects
        const participantForTicket = {
          id: participant.id,
          fullName: participant.fullname,
          email: participant.email,
          phone: participant.phone,
          dialCode: participant.dialcode,
          country: participant.country,
          organization: participant.organization,
          position: participant.position,
          category: participant.category,
          registrationType: participant.registrationtype,
          excursion: participant.excursion,
          galaDinner: participant.galadinner,
          amount: participant.amount,
          paymentStatus: participant.paymentstatus,
          paymentReference: participant.paymentreference,
          hearAbout: participant.hearabout,
          dietaryRestrictions: participant.dietaryrestrictions,
          accommodation: participant.accommodation,
          specialNeeds: participant.specialneeds,
          createdAt: participant.createdat,
          checkedIn: participant.checkedin,
          checkedInAt: participant.checkedinat,
          checkedInBy: participant.checkedinby
        };
        
        const ticketPath = await ensureTicketExists(participantForTicket);
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
        const participant = await dbGet(`SELECT * FROM participants WHERE id = $1 AND paymentstatus = 'paid'`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Ticket not found" });
        
        // Map database columns
        const participantForTicket = {
          id: participant.id,
          fullName: participant.fullname,
          email: participant.email,
          phone: participant.phone,
          dialCode: participant.dialcode,
          country: participant.country,
          organization: participant.organization,
          position: participant.position,
          category: participant.category,
          registrationType: participant.registrationtype,
          excursion: participant.excursion,
          galaDinner: participant.galadinner,
          amount: participant.amount,
          paymentStatus: participant.paymentstatus,
          paymentReference: participant.paymentreference,
          hearAbout: participant.hearabout,
          dietaryRestrictions: participant.dietaryrestrictions,
          accommodation: participant.accommodation,
          specialNeeds: participant.specialneeds,
          createdAt: participant.createdat,
          checkedIn: participant.checkedin,
          checkedInAt: participant.checkedinat,
          checkedInBy: participant.checkedinby
        };
        
        const ticketPath = await ensureTicketExists(participantForTicket);
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
          `SELECT id, fullname, email, country, organization, registrationtype, excursion, galadinner, amount, paymentstatus, checkedin, checkedinat, checkedinby FROM participants WHERE id = $1`,
          [safeId]
        );
        if (!participant) return res.status(404).json({ valid: false, error: "Participant not found" });
        if (participant.paymentstatus !== "paid") return res.json({ valid: false, error: "Payment not confirmed", paymentStatus: participant.paymentstatus });
        res.json({
          valid: true,
          participant: {
            id: participant.id, 
            fullName: participant.fullname, 
            email: participant.email, 
            country: participant.country, 
            organization: participant.organization, 
            registrationType: participant.registrationtype,
            excursion: !!participant.excursion, 
            galaDinner: !!participant.galadinner, 
            amount: participant.amount, 
            checkedIn: !!participant.checkedin, 
            checkedInAt: participant.checkedinat, 
            checkedInBy: participant.checkedinby,
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
        const participant = await dbGet(`SELECT id, fullname, paymentstatus, checkedin FROM participants WHERE id = $1`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Participant not found" });
        if (participant.paymentstatus !== "paid") return res.status(400).json({ error: "Cannot check in — payment not confirmed" });
        if (participant.checkedin) return res.status(409).json({ error: "Already checked in", alreadyCheckedIn: true });
        await dbRun(`UPDATE participants SET checkedin = $1, checkedinat = $2, checkedinby = $3 WHERE id = $4`, [true, new Date().toISOString(), staffName, safeId]);
        console.log(`✅ Checked in: ${participant.fullname} by ${staffName}`);
        res.json({ success: true, message: `${participant.fullname} checked in successfully` });
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
        if (status) { conditions.push(`paymentstatus = $${params.length + 1}`); params.push(status); }
        if (type) { conditions.push(`registrationtype = $${params.length + 1}`); params.push(type); }
        if (conditions.length) sql += ` WHERE ` + conditions.join(" AND ");
        sql += ` ORDER BY createdat DESC`;
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
        if (status) { conditions.push(`paymentstatus = $${params.length + 1}`); params.push(status); }
        if (type) { conditions.push(`registrationtype = $${params.length + 1}`); params.push(type); }
        if (conditions.length) sql += ` WHERE ` + conditions.join(" AND ");
        sql += ` ORDER BY createdat DESC`;
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
        const participant = await dbGet(`SELECT * FROM participants WHERE id = $1 AND paymentstatus = 'paid'`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Participant not found or payment not confirmed" });
        
        // Map database columns
        const participantForTicket = {
          id: participant.id,
          fullName: participant.fullname,
          email: participant.email,
          phone: participant.phone,
          dialCode: participant.dialcode,
          country: participant.country,
          organization: participant.organization,
          position: participant.position,
          category: participant.category,
          registrationType: participant.registrationtype,
          excursion: participant.excursion,
          galaDinner: participant.galadinner,
          amount: participant.amount,
          paymentStatus: participant.paymentstatus,
          paymentReference: participant.paymentreference,
          hearAbout: participant.hearabout,
          dietaryRestrictions: participant.dietaryrestrictions,
          accommodation: participant.accommodation,
          specialNeeds: participant.specialneeds,
          createdAt: participant.createdat,
          checkedIn: participant.checkedin,
          checkedInAt: participant.checkedinat,
          checkedInBy: participant.checkedinby
        };
        
        const ticketPath = await generateTicket(participantForTicket);
        
        sendTicketEmail(participantForTicket, ticketPath)
          .then(() => console.log("📧 Resent ticket email to:", participant.email))
          .catch((err) => console.error("⚠️ Failed to resend email:", err.message));
        
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
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE paymentstatus = 'paid'`),
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE paymentstatus = 'pending'`),
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE paymentstatus = 'failed'`),
          dbGet(`SELECT COUNT(*) as count FROM participants WHERE checkedin = $1`, [true]),
          dbAll(`SELECT registrationtype, COUNT(*) as count FROM participants WHERE paymentstatus = 'paid' GROUP BY registrationtype`),
          dbGet(`SELECT SUM(amount) as total FROM participants WHERE paymentstatus = 'paid'`),
        ]);
        res.json({
          registrations: { total: total.count, paid: paid.count, pending: pending.count, failed: failed.count, checkedIn: checkedIn.count, },
          byType: byType.reduce((acc, row) => { acc[row.registrationtype || "unknown"] = row.count; return acc; }, {}),
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
        const participant = await dbGet(`SELECT id, fullname FROM participants WHERE id = $1`, [safeId]);
        if (!participant) return res.status(404).json({ error: "Participant not found" });
        await dbRun(`UPDATE participants SET checkedin = $1, checkedinat = NULL, checkedinby = NULL WHERE id = $2`, [false, safeId]);
        res.json({ success: true, message: `Check-in reversed for ${participant.fullname}` });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /*
    ========================================
    START SERVER
    ========================================
    */
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Multi-currency support enabled (USD → KES conversion)`);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();