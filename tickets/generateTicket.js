const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const PAGE_W = 419.5;
const PAGE_H = 167;
const LEFT_W = 155;
const MID_W = 165;
const STUB_W = PAGE_W - LEFT_W - MID_W;

async function generateTicket(participant) {

  const ticketsDir = path.join(__dirname, "..", "tickets");
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
  }

  const filePath = path.join(ticketsDir, participant.id + ".pdf");

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    layout: "portrait",
    margin: 0,
  });

  doc.pipe(fs.createWriteStream(filePath));

  // ── ACCENT COLOR ──────────────────────────────────────────────────────────
  const regType = (participant.registrationType || "delegate").toLowerCase();
  let accent = "#C99A2E";
  if (regType === "delegate")            accent = "#3182CE";
  if (regType === "farmer")              accent = "#38A169";
  if (regType === "virtual participant") accent = "#805AD5";

  // ── BACKGROUND ────────────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE_W, PAGE_H).fill("#FFFFFF");

  // ── LEFT PANEL BACKGROUND (seeds image) ───────────────────────────────────
  const seedsBgPath = path.join(__dirname, "..", "assets", "seeds-bg.png");
  const seedsBgPathJpg = path.join(__dirname, "..", "assets", "seeds-bg.jpg");

  if (fs.existsSync(seedsBgPath)) {
    doc.save();
    doc.rect(0, 0, LEFT_W, PAGE_H).clip();
    doc.image(seedsBgPath, 0, 0, { width: LEFT_W, height: PAGE_H });
    doc.rect(0, 0, LEFT_W, PAGE_H).fill("rgba(255,255,255,0.82)");
    doc.restore();
  } else if (fs.existsSync(seedsBgPathJpg)) {
    doc.save();
    doc.rect(0, 0, LEFT_W, PAGE_H).clip();
    doc.image(seedsBgPathJpg, 0, 0, { width: LEFT_W, height: PAGE_H });
    doc.rect(0, 0, LEFT_W, PAGE_H).fill("rgba(255,255,255,0.82)");
    doc.restore();
  }

  // ── LEFT PANEL ────────────────────────────────────────────────────────────
  doc.rect(0, 0, LEFT_W, 7).fill(accent);
  doc.fillColor("#FFFFFF").fontSize(6).font("Helvetica-Bold");
  doc.text("1ST EA INDIGENOUS SEED CONFERENCE", 8, 1, { width: LEFT_W - 12, align: "center" });

  doc.fillColor(accent).fontSize(22).font("Helvetica-Bold");
  doc.text("1st EA", 14, 16, { width: LEFT_W - 20 });

  doc.fillColor("#1A1A2E").fontSize(14).font("Helvetica-Bold");
  doc.text("Indigenous Seed", 14, 42, { width: LEFT_W - 20, lineGap: 1 });

  doc.fillColor("#555555").fontSize(11).font("Helvetica");
  doc.text("Conference 2026", 14, 60, { width: LEFT_W - 20 });

  doc.moveTo(14, 76).lineTo(LEFT_W - 14, 76).strokeColor("#DDDDDD").lineWidth(0.5).stroke();

  doc.fillColor(accent).fontSize(6.5).font("Helvetica-Bold");
  doc.text("DATE", 14, 80, { width: LEFT_W - 20 });
  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold");
  doc.text("17 - 20 November 2026", 14, 89, { width: LEFT_W - 20 });

  doc.moveTo(14, 103).lineTo(LEFT_W - 14, 103).strokeColor("#EEEEEE").lineWidth(0.4).stroke();

  doc.fillColor(accent).fontSize(6.5).font("Helvetica-Bold");
  doc.text("VENUE", 14, 107, { width: LEFT_W - 20 });
  doc.fillColor("#333333").fontSize(7.5).font("Helvetica");
  doc.text("To Be Confirmed", 14, 117, { width: LEFT_W - 20 });
  doc.text("Nairobi, Kenya", 14, 127, { width: LEFT_W - 20 });

  doc.moveTo(14, 140).lineTo(LEFT_W - 14, 140).strokeColor("#EEEEEE").lineWidth(0.4).stroke();

  doc.fillColor("#AAAAAA").fontSize(5.5).font("Helvetica");
  doc.text("www.eaindigenousseedconference.org", 14, 145, { width: LEFT_W - 20 });

  // ── DIAGONAL SEPARATOR ────────────────────────────────────────────────────
  doc.moveTo(LEFT_W, 0).lineTo(LEFT_W + 10, PAGE_H).strokeColor("#CCCCCC").lineWidth(0.8).stroke();

  // ── CENTER PANEL ──────────────────────────────────────────────────────────
  const midX = LEFT_W + 10;
  doc.rect(midX, 0, MID_W, PAGE_H).fill("#1A1A2E");

  doc.rect(midX, 0, MID_W, 7).fill(accent);
  doc.fillColor("#FFFFFF").fontSize(6).font("Helvetica-Bold");
  doc.text("CONFERENCE TICKET", midX + 6, 1, { width: MID_W - 12, align: "center" });

  // Registration type badge
  doc.rect(midX + 18, 13, MID_W - 36, 16).fill(accent);
  doc.fillColor("#FFFFFF").fontSize(7.5).font("Helvetica-Bold");
  doc.text(regType.toUpperCase(), midX + 18, 17, { width: MID_W - 36, align: "center" });

  // Participant name
  const nameStr = participant.fullName || "Participant";
  const nameFontSize = nameStr.length > 22 ? 11 : nameStr.length > 16 ? 13 : 15;
  doc.fillColor("#FFFFFF").fontSize(nameFontSize).font("Helvetica-Bold");
  doc.text(nameStr, midX + 8, 36, { width: MID_W - 16, align: "center" });

  // Organisation
  doc.fillColor(accent).fontSize(7.5).font("Helvetica-Bold");
  doc.text((participant.organization || "").toUpperCase(), midX + 8, 62, { width: MID_W - 16, align: "center" });

  // Country
  doc.fillColor("#AAAAAA").fontSize(7).font("Helvetica");
  doc.text(participant.country || "", midX + 8, 73, { width: MID_W - 16, align: "center" });

  // Separator before QR
  doc.moveTo(midX + 18, 84).lineTo(midX + MID_W - 18, 84).strokeColor("#2A2A4E").lineWidth(0.4).stroke();

  // ── QR CODE — encodes readable participant details ─────────────────────────
  // When scanned, shows name / type / org / country / ID — useful for check-in staff
  // In generateTicket.js, change the qrPayload to:
  const qrPayload = `${process.env.FRONTEND_URL}/checkin?id=${participant.id}`;

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    margin: 1,
    errorCorrectionLevel: "M", // M gives good balance of data capacity vs size
    color: { dark: "#FFFFFF", light: "#1A1A2E" },
  });

  const qrSize = 66;
  const qrX = midX + (MID_W - qrSize) / 2;
  const qrY = 88;
  doc.image(qrDataUrl, qrX, qrY, { width: qrSize, height: qrSize });

  // Short human-readable ID below QR (first 8 chars, easier to read/type)
  const shortId = participant.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  doc.fillColor("#666688").fontSize(5.5).font("Helvetica-Bold");
  doc.text("REF: " + shortId, midX + 8, qrY + qrSize + 2, { width: MID_W - 16, align: "center" });

  // ── DASHED TEAR LINE ──────────────────────────────────────────────────────
  const stubX = midX + MID_W;
  doc.save();
  doc.moveTo(stubX, 6).lineTo(stubX, PAGE_H - 6)
    .dash(3, { space: 3 }).strokeColor("#444466").lineWidth(0.6).stroke();
  doc.restore();

  // ── RIGHT STUB ────────────────────────────────────────────────────────────
  doc.rect(stubX, 0, STUB_W, PAGE_H).fill("#1A1A2E");
  doc.rect(stubX, 0, STUB_W, 7).fill(accent);

  // Decorative barcode
  const bcX = stubX + STUB_W / 2 - 7;
  let bcy = 16;
  let toggle = true;
  const barWidths = [1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 1, 1, 2, 1, 3, 1, 1, 2, 1, 1];
  for (let i = 0; i < barWidths.length; i++) {
    if (toggle) {
      doc.rect(bcX, bcy, 14, barWidths[i] * 2.2).fill("#FFFFFF");
    }
    bcy += barWidths[i] * 2.2 + 0.8;
    toggle = !toggle;
  }

  // Short ref rotated on stub
  doc.save();
  doc.translate(stubX + 7, PAGE_H / 2 + 28);
  doc.rotate(-90);
  doc.fillColor("#666688").fontSize(5).font("Helvetica-Bold");
  doc.text("REF: " + shortId, 0, 0, { width: 70, align: "left" });
  doc.restore();

  // Bottom accent pill — registration type
  const stubPillH = 20;
  const stubPillY = PAGE_H - stubPillH - 6;
  doc.rect(stubX + 4, stubPillY, STUB_W - 8, stubPillH).fill(accent);

  doc.save();
  doc.translate(stubX + STUB_W / 2, stubPillY + stubPillH / 2 + 14);
  doc.rotate(-90);
  doc.fillColor("#FFFFFF").fontSize(6).font("Helvetica-Bold");
  doc.text(regType.toUpperCase(), 0, 0, { width: 40, align: "center" });
  doc.restore();

  doc.end();
  return filePath;
}

export default generateTicket;