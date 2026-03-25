// utils/sendTicketEmail.js
// Configured for Truehost SMTP relay (port 25, no TLS)

import nodemailer from "nodemailer";
import * as fs from "fs";
import path from "path";

/**
 * Creates and verifies a Nodemailer transporter using Truehost SMTP relay.
 * Truehost provides mail.truehost.co.ke as a relay host for outbound emails.
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "mail.truehost.co.ke", // Truehost relay host
  port: parseInt(process.env.EMAIL_PORT, 10) || 25, // Port 25 for relay (no TLS)
  secure: false, // Port 25 doesn't use TLS/SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 15000, // 15 seconds (relay can be slower)
  socketTimeout: 15000, // 15 seconds
});

// Verify SMTP connection on startup for immediate feedback on credentials.
transporter.verify((error) => {
  if (error) {
    console.error("❌ SMTP connection failed:", error.message);
    console.error("   Checking EMAIL configuration for Truehost relay...");
    console.error("   EMAIL_HOST:", process.env.EMAIL_HOST || "mail.truehost.co.ke");
    console.error("   EMAIL_PORT:", process.env.EMAIL_PORT || "25");
    console.error("   EMAIL_USER:", process.env.EMAIL_USER);
    console.error("   Tip: If using Truehost, make sure SMTP relay is enabled in your cPanel");
  } else {
    console.log("✅ SMTP server (Truehost relay) is ready to send emails");
    console.log("   Host:", process.env.EMAIL_HOST || "mail.truehost.co.ke");
  }
});

/**
 * Sends a conference ticket email to a participant.
 * @param {object} participant - The participant's data.
 * @param {string} participant.id - The participant's unique ID.
 * @param {string} participant.fullName - The participant's full name.
 * @param {string} participant.email - The participant's email address.
 * @param {string} participant.registrationType - The type of registration (e.g., 'delegate', 'farmer').
 * @param {string} [participant.organization] - The participant's organization.
 * @param {string} [participant.country] - The participant's country.
 * @param {string} ticketPath - The local file path to the generated PDF ticket.
 * @returns {Promise<object>} The info object from Nodemailer upon successful send.
 * @throws {Error} If the ticket file is not found or if sending fails.
 */
async function sendTicketEmail(participant, ticketPath) {
  const regType = participant.registrationType || "delegate";
  const firstName = (participant.fullName || "Participant").split(" ")[0];
  const shortId = participant.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  if (!fs.existsSync(ticketPath)) {
    throw new Error(`Ticket file not found at path: ${ticketPath}`);
  }

  const mailOptions = {
    from: `"EA Indigenous Seed Conference 2026" <${process.env.EMAIL_USER}>`,
    to: participant.email,
    bcc: process.env.SMTP_BCC || process.env.EMAIL_USER,
    subject: "Your Conference Ticket — EA Indigenous Seed Conference 2026",
    text: [
      `Dear ${firstName},`,
      "",
      "Thank you for registering for the 1st EA Indigenous Seed Conference 2026.",
      "Your conference ticket is attached to this email.",
      "",
      "EVENT DETAILS",
      "Date: 17 - 20 November 2026",
      "Venue: To Be Confirmed, Nairobi, Kenya",
      "",
      "YOUR REGISTRATION",
      `Name: ${participant.fullName || ""}`,
      `Registration Type: ${regType}`,
      `Organisation: ${participant.organization || ""}`,
      `Country: ${participant.country || ""}`,
      `Reference: ${shortId}`,
      "",
      "Please bring a printed or digital copy of your ticket to the event.",
      "The QR code on your ticket will be scanned at check-in.",
      "",
      "If you have any questions, please reply to this email.",
      "",
      "We look forward to seeing you in Nairobi!",
      "",
      "Warm regards,",
      "The Organising Team",
      "EA Indigenous Seed Conference 2026",
      "www.eaindigenousseedconference.org",
    ].join("\n"),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Conference Ticket</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1A1A2E;padding:28px 32px;text-align:center;">
              <p style="margin:0 0 4px;color:#C99A2E;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Welcome to</p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">
                1st EA Indigenous Seed<br>Conference 2026
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Dear <strong>${firstName}</strong>,</p>
              <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6;">
                Thank you for registering! Your conference ticket is attached to this email.
                Please bring a printed or digital copy for check-in.
              </p>
              <!-- Event details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-left:4px solid #C99A2E;border-radius:4px;margin:0 0 24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Event Details</p>
                    <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>📅</strong> &nbsp;17 – 20 November 2026</p>
                    <p style="margin:0;font-size:14px;color:#333;"><strong>📍</strong> &nbsp;To Be Confirmed, Nairobi, Kenya</p>
                  </td>
                </tr>
              </table>
              <!-- Registration details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-left:4px solid #1A1A2E;border-radius:4px;margin:0 0 24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Your Registration</p>
                    <table width="100%" cellpadding="4" cellspacing="0">
                      <tr><td style="font-size:13px;color:#999;width:120px;">Name</td><td style="font-size:13px;color:#333;font-weight:600;">${participant.fullName || ""}</td></tr>
                      <tr><td style="font-size:13px;color:#999;">Type</td><td style="font-size:13px;color:#333;font-weight:600;text-transform:capitalize;">${regType}</td></tr>
                      ${participant.organization ? `<tr><td style="font-size:13px;color:#999;">Organisation</td><td style="font-size:13px;color:#333;font-weight:600;">${participant.organization}</td></tr>` : ""}
                      ${participant.country ? `<tr><td style="font-size:13px;color:#999;">Country</td><td style="font-size:13px;color:#333;font-weight:600;">${participant.country}</td></tr>` : ""}
                      <tr><td style="font-size:13px;color:#999;">Reference</td><td style="font-size:13px;color:#333;font-weight:600;font-family:monospace;">${shortId}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6;">If you have any questions, simply reply to this email and our team will be happy to help.</p>
              <p style="margin:0;font-size:14px;color:#555;">We look forward to seeing you in Nairobi!</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#1A1A2E;padding:20px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#AAAAAA;">EA Indigenous Seed Conference 2026</p>
              <a href="https://www.eaindigenousseedconference.org" style="font-size:12px;color:#C99A2E;text-decoration:none;">www.eaindigenousseedconference.org</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    attachments: [
      {
        filename: "EA-Seed-Conference-2026-Ticket.pdf",
        path: ticketPath,
        contentType: "application/pdf",
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${participant.email}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send email to ${participant.email}:`, error.message);
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

export default sendTicketEmail;