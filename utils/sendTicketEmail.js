// utils/sendTicketEmail.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sgMail from '@sendgrid/mail';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.EMAIL_USER || 'registration@eaindigenousseedconference.org';
const FROM_NAME = process.env.FROM_NAME || 'EA Indigenous Seed Conference 2026';

let sendgridEnabled = false;

if (SENDGRID_API_KEY && SENDGRID_API_KEY !== 'your_sendgrid_api_key_here' && SENDGRID_API_KEY.startsWith('SG.')) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  
  // Optional: Set EU data residency if needed
  if (process.env.SENDGRID_EU_RESIDENCY === 'true') {
    sgMail.setSubstitutionWrappers('{{', '}}');
    console.log('🌍 SendGrid configured for EU data residency');
  }
  
  sendgridEnabled = true;
  console.log('✅ SendGrid initialized successfully');
} else {
  console.warn('⚠️ SendGrid API key not configured or invalid');
  console.warn('   Email sending will use SMTP fallback');
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
 * Format phone number for display
 */
function formatPhone(participant) {
  if (!participant.phone) return 'Not provided';
  const dialCode = participant.dialcode || participant.dialCode || '';
  return `${dialCode} ${participant.phone}`.trim();
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
 * Generate HTML email content
 */
function getHtmlContent(participant, eventDates) {
  const firstName = (participant.fullName || "Participant").split(" ")[0];
  const shortId = getShortId(participant);
  const regType = participant.registrationType || "delegate";
  const formattedPhone = formatPhone(participant);
  const ticketUrl = `${process.env.FRONTEND_URL}/ticket/${participant.id}`;
  
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
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
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
        Your registration is confirmed. Your conference ticket is attached to this email.
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
        <a href="${ticketUrl}" class="button">
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
 * Generate plain text email content
 */
function getPlainTextContent(participant, eventDates) {
  const firstName = (participant.fullName || "Participant").split(" ")[0];
  const shortId = getShortId(participant);
  const regType = participant.registrationType || "delegate";
  const formattedPhone = formatPhone(participant);
  const ticketUrl = `${process.env.FRONTEND_URL}/ticket/${participant.id}`;
  
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
    `Phone: ${formattedPhone}`,
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
    `View your ticket online: ${ticketUrl}`,
    "",
    "If you have any questions, please reply to this email.",
    "",
    "We look forward to seeing you in Nairobi!",
    "",
    "Warm regards,",
    "The Organising Team",
    "EA Indigenous Seed Conference 2026",
    "www.eaindigenousseedconference.org",
  ].filter(line => line !== "").join("\n");
}

/**
 * Send email using SendGrid
 */
async function sendWithSendGrid(participant, ticketPath) {
  if (!sendgridEnabled) {
    throw new Error('SendGrid not configured');
  }
  
  const eventDates = getEventDates();
  
  // Read ticket file as base64
  const ticketAttachment = fs.readFileSync(ticketPath);
  const ticketBase64 = ticketAttachment.toString('base64');
  const shortId = getShortId(participant);
  
  const msg = {
    to: participant.email,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME
    },
    subject: "🎟️ Your Conference Ticket - EA Indigenous Seed Conference 2026",
    text: getPlainTextContent(participant, eventDates),
    html: getHtmlContent(participant, eventDates),
    attachments: [
      {
        content: ticketBase64,
        filename: `EA-Seed-Conference-Ticket-${shortId}.pdf`,
        type: "application/pdf",
        disposition: "attachment"
      }
    ],
    // Optional: Track opens and clicks
    tracking_settings: {
      click_tracking: { enable: true },
      open_tracking: { enable: true }
    }
  };
  
  // Add BCC if configured
  if (process.env.SMTP_BCC) {
    msg.bcc = process.env.SMTP_BCC;
  }
  
  console.log(`📧 Sending via SendGrid to ${participant.email}...`);
  const response = await sgMail.send(msg);
  console.log(`✅ Email sent via SendGrid to ${participant.email}`);
  return { success: true, method: 'sendgrid', response };
}

/**
 * Fallback SMTP sender (if SendGrid fails)
 */
async function sendWithSMTP(participant, ticketPath) {
  console.log(`🔄 Falling back to SMTP for ${participant.email}...`);
  
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: parseInt(process.env.EMAIL_PORT, 10) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
  });
  
  const shortId = getShortId(participant);
  
  const mailOptions = {
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: participant.email,
    bcc: process.env.SMTP_BCC || null,
    subject: "🎟️ Your Conference Ticket - EA Indigenous Seed Conference 2026",
    text: getPlainTextContent(participant, getEventDates()),
    html: getHtmlContent(participant, getEventDates()),
    attachments: [
      {
        filename: `EA-Seed-Conference-Ticket-${shortId}.pdf`,
        path: ticketPath,
        contentType: "application/pdf",
      },
    ],
  };
  
  if (!mailOptions.bcc) delete mailOptions.bcc;
  
  const info = await transporter.sendMail(mailOptions);
  console.log(`✅ Email sent via SMTP to ${participant.email}`);
  return { success: true, method: 'smtp', messageId: info.messageId };
}

/**
 * Main function to send ticket email
 */
async function sendTicketEmail(participant, ticketPath) {
  // Validate inputs
  if (!participant || !participant.email) {
    console.error('❌ Cannot send email: Missing participant email');
    throw new Error('Missing participant email');
  }
  
  if (!ticketPath || !fs.existsSync(ticketPath)) {
    console.error(`❌ Ticket file not found: ${ticketPath}`);
    throw new Error(`Ticket file not found at path: ${ticketPath}`);
  }
  
  console.log(`📧 Attempting to send email to ${participant.email}...`);
  
  // Try SendGrid first if enabled
  if (sendgridEnabled) {
    try {
      const result = await sendWithSendGrid(participant, ticketPath);
      return result;
    } catch (sendgridError) {
      console.error(`⚠️ SendGrid failed for ${participant.email}:`, sendgridError.message);
      if (sendgridError.response) {
        console.error('SendGrid error details:', JSON.stringify(sendgridError.response.body, null, 2));
      }
      
      // Check if SMTP fallback is configured
      if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
        console.log('🔄 Attempting SMTP fallback...');
        try {
          const smtpResult = await sendWithSMTP(participant, ticketPath);
          return smtpResult;
        } catch (smtpError) {
          console.error(`❌ SMTP fallback also failed:`, smtpError.message);
          throw new Error(`Both SendGrid and SMTP failed: ${smtpError.message}`);
        }
      } else {
        throw new Error(`SendGrid failed: ${sendgridError.message}`);
      }
    }
  } 
  // SendGrid not configured, try SMTP only
  else if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
    console.log('📧 SendGrid not configured, using SMTP...');
    try {
      const result = await sendWithSMTP(participant, ticketPath);
      return result;
    } catch (smtpError) {
      console.error(`❌ SMTP failed:`, smtpError.message);
      throw new Error(`SMTP email failed: ${smtpError.message}`);
    }
  } 
  // No email configuration
  else {
    console.warn(`⚠️ No email configuration found. Would have sent email to ${participant.email}`);
    console.warn('   Please configure SENDGRID_API_KEY or EMAIL_HOST/EMAIL_USER');
    return { 
      success: false, 
      disabled: true, 
      message: 'Email service not configured',
      participant: participant.email 
    };
  }
}

export default sendTicketEmail;