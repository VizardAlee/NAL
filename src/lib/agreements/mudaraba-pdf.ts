import { PDFDocument, StandardFonts, degrees, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  buildMudarabaClauses,
  formatAgreementCurrency,
  formatAgreementDate,
  type MudarabaAgreementModel,
} from './mudaraba';
import type { AgreementSignerRole, AgreementSigningState } from './signing';
import { buildAgreementVerificationQr } from './verification-qr';

const A4: [number, number] = [595.28, 841.89];
const GREEN = rgb(0.027, 0.353, 0.235);
const PALE = rgb(0.965, 0.945, 0.886);
const TEXT = rgb(0.08, 0.1, 0.14);
const MUTED = rgb(0.35, 0.39, 0.45);

function pdfSafeText(text: string): string {
  return text
    .replace(/₦/g, 'NGN ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = pdfSafeText(text).split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (!paragraph.trim()) lines.push('');
  }
  return lines;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function buildMudarabaAgreementPdf(model: MudarabaAgreementModel, signing?: AgreementSigningState | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Mudaraba Investment Agreement - ${model.investor.name}`);
  pdf.setAuthor(model.company.name);
  pdf.setSubject(model.agreementId);
  pdf.setKeywords(['NAL', 'Mudaraba', 'Investment Agreement', model.agreementId]);

  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const executed = signing?.status === 'EXECUTED';
  const assetOrigin = typeof window !== 'undefined'
    ? window.location.origin
    : executed ? (process.env.NEXT_PUBLIC_APP_URL || 'https://nalgm.com') : null;
  const logoBytes = assetOrigin
    ? await fetchBytes(new URL('/NAL%20LOGO.jpg', assetOrigin).toString())
    : null;
  const logo = logoBytes ? await pdf.embedJpg(logoBytes).catch(() => null) : null;
  const stampBytes = executed && assetOrigin
    ? await fetchBytes(new URL('/nal-stamp.png', assetOrigin).toString())
    : null;
  const stamp = stampBytes ? await pdf.embedPng(stampBytes).catch(() => null) : null;
  const institutionBytes = assetOrigin
    ? await fetchBytes(new URL('/non-interest-institution.png', assetOrigin).toString())
    : null;
  const institutionMark = institutionBytes ? await pdf.embedPng(institutionBytes).catch(() => null) : null;
  const verification = await buildAgreementVerificationQr(signing).catch(() => null);
  const verificationBytes = verification ? await fetchBytes(verification.dataUrl) : null;
  const verificationQr = verificationBytes ? await pdf.embedPng(verificationBytes).catch(() => null) : null;
  const photoBytes = model.investor.photoURL ? await fetchBytes(model.investor.photoURL) : null;
  const photo = photoBytes
    ? await (async () => {
        try { return await pdf.embedJpg(photoBytes); } catch {
          try { return await pdf.embedPng(photoBytes); } catch { return null; }
        }
      })()
    : null;
  const signatureImages = new Map<AgreementSignerRole, PDFImage>();
  for (const [role, signature] of Object.entries(signing?.signatures || {})) {
    if (!signature?.signatureDataUrl) continue;
    const bytes = await fetchBytes(signature.signatureDataUrl);
    if (bytes) {
      const image = await pdf.embedPng(bytes).catch(() => null);
      if (image) signatureImages.set(role as AgreementSignerRole, image);
    }
  }

  let page!: PDFPage;
  let y = 0;
  const margin = 48;
  const width = A4[0] - margin * 2;

  const addPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - 45;
    if (logo) page.drawImage(logo, { x: margin, y: y - 28, width: 38, height: 30 });
    if (institutionMark) page.drawImage(institutionMark, { x: A4[0] - margin - 74, y: y - 34, width: 74, height: 42 });
    page.drawText(pdfSafeText(model.company.name), { x: margin + 47, y: y - 10, size: 10.5, font: bold, color: GREEN });
    page.drawText(pdfSafeText(model.company.address), { x: margin + 47, y: y - 24, size: 6.8, font: regular, color: MUTED });
    page.drawLine({ start: { x: margin, y: y - 36 }, end: { x: A4[0] - margin, y: y - 36 }, thickness: 1.2, color: GREEN });
    y -= 57;
  };

  const ensureSpace = (height: number) => {
    if (y - height < 55) addPage();
  };

  const drawWrapped = (text: string, options?: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number }) => {
    const textFont = options?.font || regular;
    const size = options?.size || 9;
    const indent = options?.indent || 0;
    const lineHeight = size * 1.38;
    const lines = wrapText(text, textFont, size, width - indent);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: margin + indent, y, size, font: textFont, color: options?.color || TEXT });
      y -= lineHeight;
    }
    y -= options?.gap ?? 5;
  };

  const drawTableRow = (label: string, value: string, index: number) => {
    const rowHeight = 27;
    ensureSpace(rowHeight);
    const labelWidth = 175;
    page.drawRectangle({ x: margin, y: y - rowHeight + 7, width: labelWidth, height: rowHeight, color: GREEN });
    page.drawRectangle({ x: margin + labelWidth, y: y - rowHeight + 7, width: width - labelWidth, height: rowHeight, color: index % 2 ? rgb(1, 1, 1) : PALE, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
    page.drawText(pdfSafeText(label), { x: margin + 8, y: y - 10, size: 9, font: bold, color: rgb(1, 1, 1) });
    page.drawText(pdfSafeText(value), { x: margin + labelWidth + 8, y: y - 10, size: 9, font: regular, color: TEXT });
    y -= rowHeight;
  };
  const drawSignature = (role: AgreementSignerRole, fallback: string) => {
    const signature = signing?.signatures[role];
    const image = signatureImages.get(role);
    if (!signature || !image) { drawWrapped(fallback); return; }
    ensureSpace(75);
    page.drawImage(image, { x: margin, y: y - 42, width: 145, height: 48 });
    y -= 48;
    drawWrapped(`Electronically signed by ${signature.signerName}\n${new Date(signature.signedAt).toLocaleString('en-NG')} | Verification ref ${signature.signatureHash.slice(0, 16).toUpperCase()}`, { size: 7.5 });
  };

  addPage();
  page.drawText('MUDARABA INVESTMENT AGREEMENT', {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: GREEN,
  });
  y -= 28;
  drawTableRow('Agreement Date', formatAgreementDate(model.agreementDate), 0);
  drawTableRow('Investment Capital', formatAgreementCurrency(model.amount), 1);
  drawTableRow('Term', model.termLabel, 2);
  drawTableRow('Maturity', `Close of business on ${formatAgreementDate(model.maturityDate)}`, 3);
  y -= 15;

  drawWrapped(`THIS MUDARABA INVESTMENT AGREEMENT is made on ${formatAgreementDate(model.agreementDate)}.`, { font: bold });
  drawWrapped('BETWEEN', { font: bold, size: 10 });
  drawWrapped(`${model.company.name}, RC No. ${model.company.rcNumber}, of ${model.company.address} (the “Company” or “Mudarib”);`);
  drawWrapped('AND', { font: bold, size: 10 });
  drawWrapped(`${model.investor.name.toUpperCase()}, of ${model.investor.address} (the “Investor” or “Rabb al-Mal”).`);
  drawWrapped('RECITAL', { font: bold, size: 10 });
  drawWrapped('The Investor has agreed to provide capital to the Company for lawful, commercially reasonable and Sharia-compliant business activities, and the Company has agreed to manage the investment on the terms set out below.');

  for (const clause of buildMudarabaClauses(model)) {
    ensureSpace(34);
    drawWrapped(`${clause.number}. ${clause.title}`, { font: bold, size: 9.5, gap: 2 });
    drawWrapped(clause.body, { size: 8.7, gap: 8 });
  }

  ensureSpace(stamp ? 335 : 210);
  drawWrapped('EXECUTION', { font: bold, size: 11 });
  drawWrapped('IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first above written.', { font: italic });
  if (photo) {
    page.drawImage(photo, { x: A4[0] - margin - 72, y: y - 68, width: 62, height: 68 });
  }
  drawWrapped('FOR NAL GENERAL MERCHANT LTD.', { font: bold });
  drawSignature('NAL_SIGNATORY_1', 'Authorised Signatory 1\nSignature: ________________________    Date: ____________________');
  drawSignature('NAL_SIGNATORY_2', 'Authorised Signatory 2\nSignature: ________________________    Date: ____________________');
  if (executed && stamp) {
    ensureSpace(130);
    page.drawText('NAL COMPANY STAMP / SEAL', { x: margin, y, size: 8.5, font: bold, color: TEXT });
    page.drawImage(stamp, { x: margin, y: y - 120, width: 180, height: 120 });
    y -= 130;
  }
  drawWrapped('SIGNED BY THE INVESTOR', { font: bold });
  drawWrapped(`Name: ${model.investor.name.toUpperCase()}\nCapacity: Investor / Rabb al-Mal`, { gap: 1 });
  drawSignature('INVESTOR', 'Signature: ________________________    Date: ____________________\nThumbprint (optional): ____________________');
  drawWrapped('WITNESSES', { font: bold });
  drawWrapped('Witness 1 — Name: ____________________  Address: ______________________________  Phone/Email: ____________________  Signature/Date: ____________________\nWitness 2 — Name: ____________________  Address: ______________________________  Phone/Email: ____________________  Signature/Date: ____________________');

  ensureSpace(175);
  drawWrapped('PAYMENT AND ACCOUNT DETAILS', { font: bold, size: 11 });
  drawTableRow('Investment Payment Date', formatAgreementDate(model.paymentDate), 0);
  drawTableRow('Payment Reference', model.paymentReference, 1);
  drawTableRow('Company Receiving Account', `${model.company.account.accountName} | ${model.company.account.accountNumber} | ${model.company.account.bankName}`, 2);
  drawTableRow('Investor Verified Account', `${model.investor.account.accountName} | ${model.investor.account.accountNumber} | ${model.investor.account.bankName}`, 3);

  if (verification && verificationQr) {
    ensureSpace(108);
    page.drawRectangle({ x: margin, y: y - 90, width, height: 94, borderColor: GREEN, borderWidth: 1, color: rgb(0.965, 0.99, 0.98) });
    page.drawImage(verificationQr, { x: margin + 8, y: y - 82, width: 76, height: 76 });
    page.drawText('SCAN TO VERIFY THIS EXECUTED AGREEMENT', { x: margin + 96, y: y - 20, size: 9, font: bold, color: GREEN });
    page.drawText(`Reference: ${verification.reference.slice(0, 24).toUpperCase()}`, { x: margin + 96, y: y - 38, size: 7.5, font: regular, color: TEXT });
    page.drawText('Opens the official NAL authenticity register at nalgm.com', { x: margin + 96, y: y - 54, size: 7, font: regular, color: MUTED });
    page.drawText('Compare the reference, parties and amount with this document.', { x: margin + 96, y: y - 68, size: 7, font: regular, color: MUTED });
    y -= 102;
  }

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    if (!executed) pdfPage.drawText('DRAFT - NOT FULLY EXECUTED', { x: 105, y: 390, size: 28, font: bold, color: rgb(0.75, 0.08, 0.08), rotate: degrees(35), opacity: 0.12 });
    const footer = `${model.company.name} | RC No. ${model.company.rcNumber} | ${model.company.email} | ${model.company.website} | ${model.company.phoneNumbers} | Page ${index + 1} of ${pages.length}`;
    pdfPage.drawLine({ start: { x: margin, y: 35 }, end: { x: A4[0] - margin, y: 35 }, thickness: 0.6, color: GREEN });
    const footerLines = wrapText(footer, regular, 6.5, width);
    pdfPage.drawText(pdfSafeText(footerLines[0]), { x: margin, y: 22, size: 6.5, font: regular, color: MUTED });
  });

  return pdf.save();
}
