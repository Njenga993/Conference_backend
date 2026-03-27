// utils/sendTicketEmail.js
import nodemailer from "nodemailer";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email configuration with validation
let transporter = null;
let emailEnabled = false;
let lastConnectionAttempt = null;
let connectionAttempts = 0;

/**
 * Validate email configuration
 */
function validateEmailConfig() {
  const required = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn(`⚠️ Missing email config: ${missing.join(', ')}. Email sending will be disabled.`);
    return false;
  }
  
  const port = parseInt(process.env.EMAIL_PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.warn(`⚠️ Invalid EMAIL_PORT: ${process.env.EMAIL_PORT}. Using default 587`);
    process.env.EMAIL_PORT = '587';
  }
  
  console.log(`📧 Email configured: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
  return true;
}

/**
 * Create and verify email transporter with retry logic
 */
async function createTransporter() {
  const configValid = validateEmailConfig();
  if (!configValid) {
    emailEnabled = false;
    return null;
  }
  
  const port = parseInt(process.env.EMAIL_PORT, 10);
  
  const transporterConfig = {
    host: process.env.EMAIL_HOST,
    port: port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates for testing
    },
    connectionTimeout: 15000, // 15 seconds
    greetingTimeout: 15000,
    socketTimeout: 20000, // 20 seconds
    // Add debug logging for SMTP (optional, can be enabled for troubleshooting)
    debug: process.env.SMTP_DEBUG === 'true',
    logger: process.env.SMTP_DEBUG === 'true',
  };
  
  // For port 587, ensure TLS is used
  if (port === 587) {
    transporterConfig.requireTLS = true;
  }
  
  try {
    const newTransporter = nodemailer.createTransport(transporterConfig);
    
    // Verify connection with timeout
    const verifyPromise = new Promise((resolve, reject) => {
      newTransporter.verify((error, success) => {
        if (error) {
          reject(error);
        } else {
          resolve(success);
        }
      });
      
      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('SMTP verification timeout')), 10000);
    });
    
    await verifyPromise;
    
    console.log(`✅ SMTP server ready on ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
    emailEnabled = true;
    connectionAttempts = 0;
    return newTransporter;
  } catch (error) {
    console.error(`❌ SMTP connection failed (attempt ${connectionAttempts + 1}):`, error.message);
    console.error(`   Host: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
    console.error(`   User: ${process.env.EMAIL_USER}`);
    console.error(`   Common fixes:`);
    console.error(`   - Check if the port is correct (587 for TLS, 465 for SSL, 25 for unencrypted)`);
    console.error(`   - Verify your email provider allows SMTP connections`);
    console.error(`   - Check if 2FA is enabled (may require app-specific password)`);
    console.error(`   - Ensure network firewall allows outbound SMTP connections`);
    
    emailEnabled = false;
    return null;
  }
}

/**
 * Retry connection with exponential backoff
 */
async function ensureTransporter() {
  if (transporter && emailEnabled) {
    return transporter;
  }
  
  const now = Date.now();
  // Rate limit connection attempts to once every 30 seconds
  if (lastConnectionAttempt && (now - lastConnectionAttempt) < 30000) {
    return null;
  }
  
  lastConnectionAttempt = now;
  connectionAttempts++;
  
  transporter = await createTransporter();
  return transporter;
}

// Initialize transporter on module load
ensureTransporter().catch(() => {});

/**
 * Format phone number for display
 */
function formatPhone(participant) {
  if (!participant.phone) return 'Not provided';
  const dialCode = participant.dialcode || participant.dialCode || '';
  return `${dialCode} ${participant.phone}`.trim();
}

/**
 * Generate a short reference ID
 */
function getShortId(participant) {
  if (participant.paymentReference) {
    return participant.paymentReference.slice(0, 8).toUpperCase();
  }
  return participant.id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * Get formatted event dates
 */
function getEventDates() {
  const startDate = new Date(process.env.EVENT_START_DATE || '2026-11-17');
  const endDate = new Date(process.env.EVENT_END_DATE || '2026-11-20');
  
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };
  
  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
    range: `${formatDate(startDate)} – ${formatDate(endDate)}`,
    venue: process.env.EVENT_VENUE || 'To Be Confirmed, Nairobi, Kenya'
  };
}

/**
 * Generate plain text email content
 */
function getPlainTextContent(participant, ticketPath, eventDates) {
  const firstName = (participant.fullName || "Participant").split(" ")[0];
  const shortId = getShortId(participant);
  const regType = participant.registrationType || "delegate";
  
  return [
    `Dear ${firstName},`,
    "",
    "Thank you for registering for the 1st EA Indigenous Seed Conference 2026.",
    "Your conference ticket is attached to this email.",
    "",
    "EVENT DETAILS",
    `Date: ${eventDates.range}`,
    `Venue: ${eventDates.venue}`,
    "",
    "YOUR REGISTRATION",
    `Name: ${participant.fullName || ""}`,
    `Email: ${participant.email || ""}`,
    `Phone: ${formatPhone(participant)}`,
    `Registration Type: ${regType.charAt(0).toUpperCase() + regType.slice(1)}`,
    participant.organization ? `Organisation: ${participant.organization}` : "",
    participant.country ? `Country: ${participant.country}` : "",
    `Reference: ${shortId}`,
    `Amount Paid: $${participant.amount || 0}`,
    "",
    participant.excursion ? `✓ Field Excursion Included` : "",
    participant.galaDinner ? `✓ Gala Dinner Included` : "",
    "",
    "IMPORTANT INFORMATION",
    "• Please bring a printed or digital copy of your ticket to the event",
    "• The QR code on your ticket will be scanned at check-in",
    "• Check-in opens at 8:00 AM on the first day",
    "• Please arrive early to complete the registration process",
    "",
    "If you have any questions, please reply to this email.",
    "",
    "We look forward to seeing you in Nairobi!",
    "",
    "Warm regards,",
    "The Organising Team",
    "EA Indigenous Seed Conference 2026",
    "www.eaindigenousseedconference.org",
    "",
    "P.S. Don't forget to follow us on social media for updates!"
  ].filter(line => line !== "").join("\n");
}

/**
 * Generate HTML email content with better styling
 */
function getHtmlContent(participant, ticketPath, eventDates) {
  const firstName = (participant.fullName || "Participant").split(" ")[0];
  const shortId = getShortId(participant);
  const regType = participant.registrationType || "delegate";
  const formattedPhone = formatPhone(participant);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Conference Ticket - EA Indigenous Seed Conference 2026</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #f4f4f4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #1a472a 0%, #0e2a1a 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.3;
    }
    .header p {
      margin: 12px 0 0;
      color: #e8c468;
      font-size: 14px;
      letter-spacing: 1px;
    }
    .content {
      padding: 32px 24px;
    }
    .greeting {
      font-size: 18px;
      color: #333;
      margin-bottom: 24px;
    }
    .event-card {
      background: #f9f9f9;
      border-left: 4px solid #e8c468;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .event-card h3 {
      margin: 0 0 12px;
      color: #1a472a;
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .event-detail {
      margin: 8px 0;
      font-size: 15px;
      color: #555;
    }
    .registration-card {
      background: #f9f9f9;
      border-left: 4px solid #1a472a;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .registration-card h3 {
      margin: 0 0 16px;
      color: #1a472a;
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .detail-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .detail-label {
      width: 120px;
      font-size: 13px;
      color: #666;
      font-weight: 500;
    }
    .detail-value {
      flex: 1;
      font-size: 13px;
      color: #333;
      font-weight: 500;
    }
    .addons {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px dashed #e0e0e0;
    }
    .addon-tag {
      display: inline-block;
      background: #e8c46820;
      color: #1a472a;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      margin-right: 8px;
      margin-top: 8px;
    }
    .info-box {
      background: #e8f5e9;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .info-box h3 {
      margin: 0 0 12px;
      color: #1a472a;
      font-size: 16px;
    }
    .info-list {
      margin: 0;
      padding-left: 20px;
    }
    .info-list li {
      margin: 8px 0;
      font-size: 13px;
      color: #555;
    }
    .button {
      display: inline-block;
      background: #1a472a;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin: 24px 0;
    }
    .footer {
      background: #f4f4f4;
      padding: 24px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }
    .footer p {
      margin: 0;
      font-size: 12px;
      color: #666;
    }
    .footer a {
      color: #1a472a;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .container {
        width: 100% !important;
      }
      .detail-row {
        flex-direction: column;
      }
      .detail-label {
        width: 100%;
        margin-bottom: 4px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>EA Indigenous Seed<br>Conference 2026</h1>
      <p>Preserving Heritage • Cultivating Tomorrow</p>
    </div>
    
    <div class="content">
      <div class="greeting">
        Dear <strong>${firstName}</strong>,
      </div>
      
      <p style="margin: 0 0 16px; font-size: 15px; color: #555; line-height: 1.6;">
        Thank you for registering for the 1st East African Indigenous Seed Conference 2026!
        Your registration is confirmed and your conference ticket is attached to this email.
      </p>
      
      <div class="event-card">
        <h3>📅 Event Details</h3>
        <div class="event-detail"><strong>Dates:</strong> ${eventDates.range}</div>
        <div class="event-detail"><strong>Venue:</strong> ${eventDates.venue}</div>
        <div class="event-detail"><strong>Check-in:</strong> Opens at 8:00 AM daily</div>
      </div>
      
      <div class="registration-card">
        <h3>🎟️ Your Registration</h3>
        <div class="detail-row">
          <div class="detail-label">Name</div>
          <div class="detail-value">${participant.fullName || ''}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Email</div>
          <div class="detail-value">${participant.email || ''}</div>
        </div>
        ${formattedPhone !== 'Not provided' ? `
        <div class="detail-row">
          <div class="detail-label">Phone</div>
          <div class="detail-value">${formattedPhone}</div>
        </div>
        ` : ''}
        <div class="detail-row">
          <div class="detail-label">Registration Type</div>
          <div class="detail-value" style="text-transform: capitalize;">${regType}</div>
        </div>
        ${participant.organization ? `
        <div class="detail-row">
          <div class="detail-label">Organization</div>
          <div class="detail-value">${participant.organization}</div>
        </div>
        ` : ''}
        ${participant.country ? `
        <div class="detail-row">
          <div class="detail-label">Country</div>
          <div class="detail-value">${participant.country}</div>
        </div>
        ` : ''}
        <div class="detail-row">
          <div class="detail-label">Reference ID</div>
          <div class="detail-value"><code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${shortId}</code></div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Amount Paid</div>
          <div class="detail-value"><strong>$${participant.amount || 0}</strong></div>
        </div>
        
        ${(participant.excursion || participant.galaDinner) ? `
        <div class="addons">
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">Included Add-ons:</div>
          ${participant.excursion ? '<span class="addon-tag">🌱 Field Excursion</span>' : ''}
          ${participant.galaDinner ? '<span class="addon-tag">🍽️ Gala Dinner</span>' : ''}
        </div>
        ` : ''}
      </div>
      
      <div class="info-box">
        <h3>✨ Important Information</h3>
        <ul class="info-list">
          <li>Please bring a printed or digital copy of your ticket to the event</li>
          <li>The QR code on your ticket will be scanned at check-in</li>
          <li>Please arrive early on the first day to complete the registration process</li>
          <li>Name badges and conference materials will be provided at check-in</li>
          <li>Wi-Fi access details will be available at the registration desk</li>
        </ul>
      </div>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/ticket/${participant.id}" class="button">
          View Ticket Online
        </a>
      </div>
      
      <p style="margin: 16px 0 0; font-size: 13px; color: #666; font-style: italic;">
        If you have any questions about your registration, please reply to this email and our support team will assist you promptly.
      </p>
    </div>
    
    <div class="footer">
      <p>© 2026 East African Indigenous Seed Conference. All rights reserved.</p>
      <p>
        <a href="https://www.eaindigenousseedconference.org">Visit our website</a> |
        <a href="${process.env.FRONTEND_URL}/contact">Contact us</a>
      </p>
      <p style="margin-top: 12px; font-size: 11px;">
        This is an automated message. Please do not reply directly to this email.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Main function to send ticket email
 */
async function sendTicketEmail(participant, ticketPath) {
  // Check if email is enabled
  if (!emailEnabled && !transporter) {
    console.log('📧 Email sending disabled. Would have sent to:', participant.email);
    console.log('   Ticket available at:', ticketPath);
    console.log('   Please configure EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS');
    return { success: false, disabled: true, message: 'Email service not configured' };
  }
  
  // Ensure transporter is available
  if (!transporter) {
    const newTransporter = await ensureTransporter();
    if (!newTransporter) {
      console.error(`❌ Cannot send email to ${participant.email}: SMTP not configured`);
      return { success: false, error: 'SMTP service unavailable' };
    }
    transporter = newTransporter;
  }
  
  // Validate inputs
  if (!participant || !participant.email) {
    console.error('❌ Cannot send email: Missing participant email');
    return { success: false, error: 'Missing participant email' };
  }
  
  if (!ticketPath || !fs.existsSync(ticketPath)) {
    console.error(`❌ Cannot send email: Ticket file not found at ${ticketPath}`);
    return { success: false, error: 'Ticket file not found' };
  }
  
  const eventDates = getEventDates();
  
  const mailOptions = {
    from: `"EA Indigenous Seed Conference 2026" <${process.env.EMAIL_USER}>`,
    to: participant.email,
    bcc: process.env.SMTP_BCC || null,
    subject: "🎟️ Your Conference Ticket - EA Indigenous Seed Conference 2026",
    text: getPlainTextContent(participant, ticketPath, eventDates),
    html: getHtmlContent(participant, ticketPath, eventDates),
    attachments: [
      {
        filename: `EA-Seed-Conference-Ticket-${getShortId(participant)}.pdf`,
        path: ticketPath,
        contentType: "application/pdf",
      },
    ],
  };
  
  // Remove BCC if not set
  if (!mailOptions.bcc) {
    delete mailOptions.bcc;
  }
  
  try {
    console.log(`📧 Sending email to ${participant.email}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${participant.email}`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Ticket attached: ${mailOptions.attachments[0].filename}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send email to ${participant.email}:`, error.message);
    
    // Provide specific troubleshooting tips based on error
    if (error.code === 'ECONNREFUSED') {
      console.error('   💡 Connection refused. Check:');
      console.error(`      - Host: ${process.env.EMAIL_HOST} is reachable?`);
      console.error(`      - Port: ${process.env.EMAIL_PORT} is open?`);
      console.error('      - Firewall allows outbound SMTP connections?');
    } else if (error.code === 'EAUTH') {
      console.error('   💡 Authentication failed. Check:');
      console.error(`      - Email: ${process.env.EMAIL_USER}`);
      console.error('      - Password is correct?');
      console.error('      - App-specific password required if 2FA enabled?');
    } else if (error.code === 'ESOCKET') {
      console.error('   💡 Socket error. Check:');
      console.error('      - Network connectivity');
      console.error('      - Timeout settings');
      console.error('      - SSL/TLS configuration');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('   💡 Connection timeout. Check:');
      console.error('      - Server response time');
      console.error('      - Firewall rules');
    }
    
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

// Export the function and utility for testing
export default sendTicketEmail;
export { validateEmailConfig, ensureTransporter };