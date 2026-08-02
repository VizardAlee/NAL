import { PDFDocument, StandardFonts, degrees, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatAgreementCurrency, formatAgreementDate } from './mudaraba';
import { buildWakalahClauses, type WakalahAgreementModel } from './wakalah';
import type { AgreementSignerRole, AgreementSigningState } from './signing';
import { buildAgreementVerificationQr } from './verification-qr';

const A4: [number, number] = [595.28, 841.89];
const GREEN = rgb(0.027, 0.353, 0.235);
const TEXT = rgb(0.08, 0.1, 0.14);
const MUTED = rgb(0.35, 0.39, 0.45);

function safe(text: string): string {
  return text.replace(/₦/g, 'NGN ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (!paragraph.trim()) lines.push('');
  }
  return lines;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch { return null; }
}

export async function buildWakalahAgreementPdf(model: WakalahAgreementModel, signing?: AgreementSigningState | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Wakalah Agreement - ${model.client.name}`);
  pdf.setAuthor(model.company.name);
  pdf.setSubject(model.agreementId);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const executed = signing?.status === 'EXECUTED';
  const assetOrigin = typeof window !== 'undefined' ? window.location.origin : executed ? (process.env.NEXT_PUBLIC_APP_URL || 'https://nalgm.com') : null;
  const logoBytes = assetOrigin ? await fetchBytes(new URL('/NAL%20LOGO.jpg', assetOrigin).toString()) : null;
  const logo = logoBytes ? await pdf.embedJpg(logoBytes).catch(() => null) : null;
  const stampBytes = executed && assetOrigin ? await fetchBytes(new URL('/nal-stamp.png', assetOrigin).toString()) : null;
  const stamp = stampBytes ? await pdf.embedPng(stampBytes).catch(() => null) : null;
  const institutionBytes = assetOrigin ? await fetchBytes(new URL('/non-interest-institution.png', assetOrigin).toString()) : null;
  const institutionMark = institutionBytes ? await pdf.embedPng(institutionBytes).catch(() => null) : null;
  const verification = await buildAgreementVerificationQr(signing).catch(() => null);
  const verificationBytes = verification ? await fetchBytes(verification.dataUrl) : null;
  const verificationQr = verificationBytes ? await pdf.embedPng(verificationBytes).catch(() => null) : null;
  const photoBytes = model.client.photoURL ? await fetchBytes(model.client.photoURL) : null;
  const photo = photoBytes ? await (async () => {
    try { return await pdf.embedJpg(photoBytes); } catch { try { return await pdf.embedPng(photoBytes); } catch { return null; } }
  })() : null;
  const signatureImages = new Map<AgreementSignerRole, PDFImage>();
  for (const [role, signature] of Object.entries(signing?.signatures || {})) {
    if (!signature?.signatureDataUrl) continue;
    const bytes = await fetchBytes(signature.signatureDataUrl);
    if (bytes) { const image = await pdf.embedPng(bytes).catch(() => null); if (image) signatureImages.set(role as AgreementSignerRole, image); }
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
    page.drawText(safe(model.company.name), { x: margin + 47, y: y - 10, size: 10.5, font: bold, color: GREEN });
    page.drawText(safe(model.company.address), { x: margin + 47, y: y - 24, size: 6.8, font: regular, color: MUTED });
    page.drawLine({ start: { x: margin, y: y - 36 }, end: { x: A4[0] - margin, y: y - 36 }, thickness: 1.2, color: GREEN });
    y -= 57;
  };
  const ensure = (height: number) => { if (y - height < 55) addPage(); };
  const draw = (text: string, options?: { font?: PDFFont; size?: number; gap?: number }) => {
    const font = options?.font || regular;
    const size = options?.size || 9;
    const lineHeight = size * 1.38;
    for (const line of wrap(text, font, size, width)) {
      ensure(lineHeight);
      page.drawText(line, { x: margin, y, size, font, color: TEXT });
      y -= lineHeight;
    }
    y -= options?.gap ?? 5;
  };
  const drawSignature = (role: AgreementSignerRole, fallback: string) => {
    const signature = signing?.signatures[role]; const image = signatureImages.get(role);
    if (!signature || !image) { draw(fallback); return; }
    ensure(75); page.drawImage(image, { x: margin, y: y - 42, width: 145, height: 48 }); y -= 48;
    draw(`Electronically signed by ${signature.signerName}\n${new Date(signature.signedAt).toLocaleString('en-NG')} | Verification ref ${signature.signatureHash.slice(0, 16).toUpperCase()}`, { size: 7.5 });
  };

  addPage();
  page.drawText('WAKALAH AGREEMENT', { x: margin, y, size: 17, font: bold, color: GREEN });
  y -= 28;
  draw(`Agreement Reference: ${model.agreementId}`, { font: bold });
  draw(`Deal: ${model.deal.name}`);
  draw(`Approved Asset: ${model.deal.assetDescription}`);
  draw(`Approved Supplier: ${model.deal.supplierName}`);
  draw(`Procurement Funds: ${formatAgreementCurrency(model.deal.principal)}`);
  y -= 5;
  draw(`THIS WAKALAH AGREEMENT is made this ${formatAgreementDate(model.agreementDate)} between:`, { font: bold });
  draw('BETWEEN', { font: bold, size: 10 });
  draw(`${model.company.name}, RC No. ${model.company.rcNumber}, of ${model.company.address}, hereinafter referred to as the “Company” or “Financier”, which expression shall, where the context permits, include its successors-in-title and permitted assigns;`);
  draw('AND', { font: bold, size: 10 });
  draw(`${model.client.name.toUpperCase()}, of ${model.client.address}, hereinafter referred to as the “Customer” or “Agent”, which expression shall, where the context permits, include the Customer’s lawful representatives, heirs and permitted assigns.`);
  draw(`At the request of the Customer and strictly for operational convenience, the Company hereby appoints the Customer as its disclosed procurement agent (Wakil), solely for the purpose of identifying, negotiating and purchasing ${model.deal.assetDescription} from ${model.deal.supplierName} on behalf of and in the name of the Company.`);
  draw('The Customer hereby agrees to be bound by the following terms and undertakings:');
  for (const clause of buildWakalahClauses(model)) {
    ensure(35);
    draw(`${clause.number}. ${clause.title}`, { font: bold, size: 9.5, gap: 2 });
    draw(clause.body, { size: 8.7, gap: 8 });
  }
  ensure(stamp ? 350 : 225);
  draw('EXECUTION', { font: bold, size: 11 });
  draw('IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first above written.', { font: italic });
  if (photo) page.drawImage(photo, { x: A4[0] - margin - 72, y: y - 72, width: 62, height: 72 });
  draw('SIGNED FOR AND ON BEHALF OF NAL GENERAL MERCHANT LTD.', { font: bold });
  drawSignature('NAL_SIGNATORY_1', 'Authorised Signatory 1\nSignature: ________________________    Date: ____________________');
  drawSignature('NAL_SIGNATORY_2', 'Authorised Signatory 2\nSignature: ________________________    Date: ____________________');
  if (executed && stamp) {
    ensure(130);
    page.drawText('NAL COMPANY STAMP / SEAL', { x: margin, y, size: 8.5, font: bold, color: TEXT });
    page.drawImage(stamp, { x: margin, y: y - 120, width: 180, height: 120 });
    y -= 130;
  }
  draw('SIGNED BY THE CUSTOMER', { font: bold });
  draw(`Name: ${model.client.name.toUpperCase()}\nCapacity: Customer / Wakil`, { gap: 1 });
  drawSignature('CLIENT', 'Signature: ________________________    Date: ____________________');
  draw('IN THE PRESENCE OF A WITNESS', { font: bold });
  drawSignature('WITNESS', 'Name: ______________________________\nPhone Number: _______________________\nSignature: __________________________    Date: ____________________');

  if (verification && verificationQr) {
    ensure(108);
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
    const footer = `${model.company.name} | RC No. ${model.company.rcNumber} | ${model.company.email} | ${model.company.website} | Tel: ${model.company.phoneNumbers} | Page ${index + 1} of ${pages.length}`;
    pdfPage.drawLine({ start: { x: margin, y: 35 }, end: { x: A4[0] - margin, y: 35 }, thickness: 0.6, color: GREEN });
    pdfPage.drawText(safe(wrap(footer, regular, 6.5, width)[0]), { x: margin, y: 22, size: 6.5, font: regular, color: MUTED });
  });
  return pdf.save();
}
