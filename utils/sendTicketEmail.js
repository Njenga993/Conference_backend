const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

// ✅ Use EMAIL_* variable names to match your .env
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify SMTP connection on startup so you know immediately if creds are wrong
transporter.verify((err) => {
  if (err) {
    console.error("❌ SMTP connection failed:", err.message);
    console.error("   Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in .env");
  } else {
    console.log("✅ SMTP connected:", process.env.EMAIL_HOST);
  }
});

async function sendTicketEmail(participant, ticketPath) {

  const regType = (participant.registrationType || "delegate");
  const firstName = (participant.fullName || "Participant").split(" ")[0];
  const shortId = participant.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  if (!fs.existsSync(ticketPath)) {
    throw new Error("Ticket file not found: " + ticketPath);
  }

  const mailOptions = {
    from: '"EA Indigenous Seed Conference 2026" <' + process.env.EMAIL_USER + '>',
    to: participant.email,
    bcc: process.env.SMTP_BCC || process.env.EMAIL_USER,
    subject: "Your Conference Ticket — EA Indigenous Seed Conference 2026",

    text: [
      "Dear " + firstName + ",",
      "",
      "Thank you for registering for the 1st EA Indigenous Seed Conference 2026.",
      "Your conference ticket is attached to this email.",
      "",
      "EVENT DETAILS",
      "Date: 17 - 20 November 2026",
      "Venue: To Be Confirmed, Nairobi, Kenya",
      "",
      "YOUR REGISTRATION",
      "Name: " + (participant.fullName || ""),
      "Registration Type: " + regType,
      "Organisation: " + (participant.organization || ""),
      "Country: " + (participant.country || ""),
      "Reference: " + shortId,
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
                      <tr>
                        <td style="font-size:13px;color:#999;width:120px;">Name</td>
                        <td style="font-size:13px;color:#333;font-weight:600;">${participant.fullName || ""}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#999;">Type</td>
                        <td style="font-size:13px;color:#333;font-weight:600;text-transform:capitalize;">${regType}</td>
                      </tr>
                      ${participant.organization ? `
                      <tr>
                        <td style="font-size:13px;color:#999;">Organisation</td>
                        <td style="font-size:13px;color:#333;font-weight:600;">${participant.organization}</td>
                      </tr>` : ""}
                      ${participant.country ? `
                      <tr>
                        <td style="font-size:13px;color:#999;">Country</td>
                        <td style="font-size:13px;color:#333;font-weight:600;">${participant.country}</td>
                      </tr>` : ""}
                      <tr>
                        <td style="font-size:13px;color:#999;">Reference</td>
                        <td style="font-size:13px;color:#333;font-weight:600;font-family:monospace;">${shortId}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6;">
                If you have any questions, simply reply to this email and our team will be happy to help.
              </p>
              <p style="margin:0;font-size:14px;color:#555;">We look forward to seeing you in Nairobi!</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#1A1A2E;padding:20px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#AAAAAA;">EA Indigenous Seed Conference 2026</p>
              <a href="https://www.eaindigenousseedconference.org" style="font-size:12px;color:#C99A2E;text-decoration:none;">
                www.eaindigenousseedconference.org
              </a>
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

  const info = await transporter.sendMail(mailOptions);
  console.log("✅ Email sent:", info.messageId, "to:", participant.email);
  return info;
}

module.exports = sendTicketEmail;