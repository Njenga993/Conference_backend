// tickets/generateTicket.js

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- Fix for __dirname in ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// -----------------------------------------

// --- Page Layout Constants (in points, 1 point = 1/72 inch) ---
const PAGE_W = 419.5; // Total width of the ticket
const PAGE_H = 167; // Total height of the ticket
const LEFT_W = 155; // Width of the left panel
const MID_W = 165; // Width of the middle panel
const STUB_W = PAGE_W - LEFT_W - MID_W; // Width of the right stub
// --------------------------------------------------------------

/**
 * Generates a personalized PDF ticket for a conference participant.
 * @param {object} participant - The participant's data.
 * @param {string} participant.id - The participant's unique ID.
 * @param {string} participant.fullName - The participant's full name.
 * @param {string} participant.registrationType - The type of registration.
 * @param {string} [participant.organization] - The participant's organization.
 * @param {string} [participant.country] - The participant's country.
 * @returns {Promise<string>} The file path of the generated PDF ticket.
 */
async function generateTicket(participant) {
  const ticketsDir = path.join(__dirname, "..", "tickets");
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
  }

  const filePath = path.join(ticketsDir, `${participant.id}.pdf`);

  // === NORMALIZE INPUT (handles both camelCase and lowercase from DB) ===
  const fullName =
    participant.fullName || participant.fullname || "Participant";
  const registrationType =
    participant.registrationType || participant.registrationtype || "delegate";
  const organization =
    participant.organization || participant.organization || "";
  const country = participant.country || participant.country || "";
  // ======================================================================

  console.log(`📄 Generating ticket for: ${fullName} (${registrationType})`);

  // Create a new PDF document
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    layout: "portrait",
    margin: 0,
  });

  // Pipe the PDF to an output file stream
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  // --- DYNAMIC STYLING ---
  const regType = (registrationType || "delegate").toLowerCase();
  let accent = "#C99A2E"; // Default color
  if (regType === "delegate") accent = "#3182CE";
  if (regType === "farmer") accent = "#38A169";
  if (regType === "virtual" || regType === "virtual participant")
    accent = "#805AD5";

  // --- BACKGROUND ---
  doc.rect(0, 0, PAGE_W, PAGE_H).fill("#FFFFFF");

  // --- LEFT PANEL (with background image) ---
  const seedsBgPath = path.join(__dirname, "..", "assets", "seeds-bg.png");
  const seedsBgPathJpg = path.join(__dirname, "..", "assets", "seeds-bg.jpg");
  const bgImage = fs.existsSync(seedsBgPath)
    ? seedsBgPath
    : fs.existsSync(seedsBgPathJpg)
      ? seedsBgPathJpg
      : null;

  if (bgImage) {
    doc.save();
    doc
      .rect(0, 0, LEFT_W, PAGE_H)
      .clip()
      .image(bgImage, 0, 0, { width: LEFT_W, height: PAGE_H });
    doc.rect(0, 0, LEFT_W, PAGE_H).fill("rgba(255,255,255,0.82)").restore();
  }

  // --- LEFT PANEL CONTENT ---
  doc.rect(0, 0, LEFT_W, 7).fill(accent);
  doc
    .fillColor("#FFFFFF")
    .fontSize(6)
    .font("Helvetica-Bold")
    .text("1ST EA INDIGENOUS SEED CONFERENCE", 8, 1, {
      width: LEFT_W - 12,
      align: "center",
    });
  doc
    .fillColor(accent)
    .fontSize(22)
    .font("Helvetica-Bold")
    .text("1st EA", 14, 16, { width: LEFT_W - 20 });
  doc
    .fillColor("#1A1A2E")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Indigenous Seed", 14, 42, { width: LEFT_W - 20, lineGap: 1 });
  doc
    .fillColor("#555555")
    .fontSize(11)
    .font("Helvetica")
    .text("Conference 2026", 14, 60, { width: LEFT_W - 20 });
  doc
    .moveTo(14, 76)
    .lineTo(LEFT_W - 14, 76)
    .strokeColor("#DDDDDD")
    .lineWidth(0.5)
    .stroke();
  doc
    .fillColor(accent)
    .fontSize(6.5)
    .font("Helvetica-Bold")
    .text("DATE", 14, 80, { width: LEFT_W - 20 });
  doc
    .fillColor("#333333")
    .fontSize(8)
    .font("Helvetica-Bold")
    .text("17 - 20 November 2026", 14, 89, { width: LEFT_W - 20 });
  doc
    .moveTo(14, 103)
    .lineTo(LEFT_W - 14, 103)
    .strokeColor("#EEEEEE")
    .lineWidth(0.4)
    .stroke();
  doc
    .fillColor(accent)
    .fontSize(6.5)
    .font("Helvetica-Bold")
    .text("VENUE", 14, 107, { width: LEFT_W - 20 });
  doc
    .fillColor("#333333")
    .fontSize(7.5)
    .font("Helvetica")
    .text("To Be Confirmed", 14, 117, { width: LEFT_W - 20 })
    .text("Nairobi, Kenya", 14, 127, { width: LEFT_W - 20 });
  doc
    .moveTo(14, 140)
    .lineTo(LEFT_W - 14, 140)
    .strokeColor("#EEEEEE")
    .lineWidth(0.4)
    .stroke();
  doc
    .fillColor("#AAAAAA")
    .fontSize(5.5)
    .font("Helvetica")
    .text("www.eaindigenousseedconference.org", 14, 145, {
      width: LEFT_W - 20,
    });

  // --- DIAGONAL SEPARATOR ---
  doc
    .moveTo(LEFT_W, 0)
    .lineTo(LEFT_W + 10, PAGE_H)
    .strokeColor("#CCCCCC")
    .lineWidth(0.8)
    .stroke();

  // --- CENTER PANEL ---
  const midX = LEFT_W + 10;
  doc.rect(midX, 0, MID_W, PAGE_H).fill("#1A1A2E");
  doc.rect(midX, 0, MID_W, 7).fill(accent);
  doc
    .fillColor("#FFFFFF")
    .fontSize(6)
    .font("Helvetica-Bold")
    .text("CONFERENCE TICKET", midX + 6, 1, {
      width: MID_W - 12,
      align: "center",
    });
  doc.rect(midX + 18, 13, MID_W - 36, 16).fill(accent);
  doc
    .fillColor("#FFFFFF")
    .fontSize(7.5)
    .font("Helvetica-Bold")
    .text(regType.toUpperCase(), midX + 18, 17, {
      width: MID_W - 36,
      align: "center",
    });

  // Display participant name with adaptive font size
  const nameStr = fullName;
  const nameFontSize = nameStr.length > 22 ? 11 : nameStr.length > 16 ? 13 : 15;
  doc
    .fillColor("#FFFFFF")
    .fontSize(nameFontSize)
    .font("Helvetica-Bold")
    .text(nameStr, midX + 8, 36, { width: MID_W - 16, align: "center" });

  const orgStr = organization || "";
  if (orgStr) {
    doc
      .fillColor(accent)
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .text(orgStr.toUpperCase(), midX + 8, 62, {
        width: MID_W - 16,
        align: "center",
      });
  }

  const countryStr = country || "";
  if (countryStr) {
    doc
      .fillColor("#AAAAAA")
      .fontSize(7)
      .font("Helvetica")
      .text(countryStr, midX + 8, 73, { width: MID_W - 16, align: "center" });
  }

  doc
    .moveTo(midX + 18, 84)
    .lineTo(midX + MID_W - 18, 84)
    .strokeColor("#2A2A4E")
    .lineWidth(0.4)
    .stroke();

  // --- QR CODE ---
  const frontendUrl = process.env.FRONTEND_URL;
  const shortId = participant.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const qrPayload = `${frontendUrl}/checkin?id=${participant.id}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#FFFFFF", light: "#1A1A2E" },
    });
    const qrSize = 66;
    const qrX = midX + (MID_W - qrSize) / 2;
    const qrY = 88;
    doc.image(qrDataUrl, qrX, qrY, { width: qrSize, height: qrSize });
    doc
      .fillColor("#666688")
      .fontSize(5.5)
      .font("Helvetica-Bold")
      .text("REF: " + shortId, midX + 8, qrY + qrSize + 2, {
        width: MID_W - 16,
        align: "center",
      });
  } catch (err) {
    console.error("Failed to generate QR code:", err);
    doc
      .fillColor("#FF0000")
      .fontSize(8)
      .font("Helvetica")
      .text("QR Code Error", midX + 8, 100, {
        width: MID_W - 16,
        align: "center",
      });
  }

  // --- DASHED TEAR LINE ---
  const stubX = midX + MID_W;
  doc
    .save()
    .moveTo(stubX, 6)
    .lineTo(stubX, PAGE_H - 6)
    .dash(3, { space: 3 })
    .strokeColor("#444466")
    .lineWidth(0.6)
    .stroke()
    .restore();

  // --- RIGHT STUB ---
  doc
    .rect(stubX, 0, STUB_W, PAGE_H)
    .fill("#1A1A2E")
    .rect(stubX, 0, STUB_W, 7)
    .fill(accent);

  // Decorative barcode
  const bcX = stubX + STUB_W / 2 - 7;
  let bcy = 16;
  const barWidths = [
    1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 1, 1, 2, 1, 3, 1, 1, 2, 1, 1,
  ];
  barWidths.forEach((width, i) => {
    if (i % 2 === 0) doc.rect(bcX, bcy, 14, width * 2.2).fill("#FFFFFF");
    bcy += width * 2.2 + 0.8;
  });

  // Short ref rotated on stub
  doc
    .save()
    .translate(stubX + 7, PAGE_H / 2 + 28)
    .rotate(-90)
    .fillColor("#666688")
    .fontSize(5)
    .font("Helvetica-Bold")
    .text("REF: " + shortId, 0, 0, { width: 70, align: "left" })
    .restore();

  // Bottom accent pill
  const stubPillH = 20;
  const stubPillY = PAGE_H - stubPillH - 6;
  doc.rect(stubX + 4, stubPillY, STUB_W - 8, stubPillH).fill(accent);
  doc
    .save()
    .translate(stubX + STUB_W / 2, stubPillY + stubPillH / 2 + 14)
    .rotate(-90)
    .fillColor("#FFFFFF")
    .fontSize(6)
    .font("Helvetica-Bold")
    .text(regType.toUpperCase(), 0, 0, { width: 40, align: "center" })
    .restore();

  // Finalize the PDF - wait for write stream to finish
  doc.end();

  // Return a promise that resolves when the file is fully written
  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => {
      console.log(`✅ Ticket PDF saved: ${filePath}`);
      resolve(filePath);
    });
    writeStream.on("error", reject);
  });
}

export default generateTicket;
