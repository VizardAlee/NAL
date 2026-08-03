import { PDFDocument, StandardFonts, degrees, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatAgreementCurrency, formatAgreementDate } from './mudaraba';
import { buildMurabahaClauses, type MurabahaAgreementModel } from './murabaha';
import type { AgreementSignerRole, AgreementSigningState } from './signing';
import { buildAgreementVerificationQr } from './verification-qr';

const A4: [number, number] = [595.28, 841.89];
const GREEN = rgb(0.027, 0.353, 0.235);
const TEXT = rgb(0.08, 0.1, 0.14);
const MUTED = rgb(0.35, 0.39, 0.45);
const TABLE_HEADER = rgb(0.20, 0.25, 0.32);
const TABLE_ALT = rgb(0.91, 0.95, 0.97);

function safe(text: string): string {
  return text.replace(/₦/g, 'NGN ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (!paragraph.trim()) lines.push('');
  }
  return lines;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try { const response = await fetch(url); return response.ok ? new Uint8Array(await response.arrayBuffer()) : null; }
  catch { return null; }
}

function shortMoney(value: number): string {
  return `NGN ${new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

export async function buildMurabahaAgreementPdf(model: MurabahaAgreementModel, signing?: AgreementSigningState | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Murabaha Sales Contract - ${model.client.name}`);
  pdf.setAuthor(model.company.name);
  pdf.setSubject(model.agreementId);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const executed = signing?.status === 'EXECUTED';
  const assetOrigin = typeof window !== 'undefined' ? window.location.origin : executed ? (process.env.NEXT_PUBLIC_APP_URL || 'https://nalgm.com') : null;
  const logoBytes = assetOrigin ? await fetchBytes(new URL('/NAL%20LOGO.jpg', assetOrigin).toString()) : null;
  const logo = logoBytes ? await pdf.embedJpg(logoBytes).catch(() => null) : null;
  const institutionBytes = assetOrigin ? await fetchBytes(new URL('/non-interest-institution.png', assetOrigin).toString()) : null;
  const institution = institutionBytes ? await pdf.embedPng(institutionBytes).catch(() => null) : null;
  const stampBytes = executed && assetOrigin ? await fetchBytes(new URL('/nal-stamp.png', assetOrigin).toString()) : null;
  const stamp = stampBytes ? await pdf.embedPng(stampBytes).catch(() => null) : null;
  const photoBytes = model.client.photoURL ? await fetchBytes(model.client.photoURL) : null;
  const photo = photoBytes ? await (async () => { try { return await pdf.embedJpg(photoBytes); } catch { try { return await pdf.embedPng(photoBytes); } catch { return null; } } })() : null;
  const verification = await buildAgreementVerificationQr(signing).catch(() => null);
  const verificationBytes = verification ? await fetchBytes(verification.dataUrl) : null;
  const verificationQr = verificationBytes ? await pdf.embedPng(verificationBytes).catch(() => null) : null;
  const signatureImages = new Map<AgreementSignerRole, PDFImage>();
  for (const [role, signature] of Object.entries(signing?.signatures || {})) {
    if (!signature?.signatureDataUrl) continue;
    const bytes = await fetchBytes(signature.signatureDataUrl);
    if (bytes) { const image = await pdf.embedPng(bytes).catch(() => null); if (image) signatureImages.set(role as AgreementSignerRole, image); }
  }

  let page!: PDFPage;
  let y = 0;
  const margin = 42;
  const width = A4[0] - margin * 2;
  const addPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - 42;
    if (logo) page.drawImage(logo, { x: margin, y: y - 27, width: 38, height: 29 });
    if (institution) page.drawImage(institution, { x: A4[0] - margin - 72, y: y - 33, width: 72, height: 41 });
    page.drawText(safe(model.company.name), { x: margin + 46, y: y - 9, size: 10.5, font: bold, color: GREEN });
    page.drawText(safe(model.company.address), { x: margin + 46, y: y - 23, size: 6.6, font: regular, color: MUTED });
    page.drawLine({ start: { x: margin, y: y - 36 }, end: { x: A4[0] - margin, y: y - 36 }, thickness: 1.2, color: GREEN });
    y -= 56;
  };
  const ensure = (height: number) => { if (y - height < 52) addPage(); };
  const draw = (text: string, options?: { font?: PDFFont; size?: number; gap?: number; indent?: number }) => {
    const font = options?.font || regular;
    const size = options?.size || 8.6;
    const indent = options?.indent || 0;
    const lineHeight = size * 1.36;
    for (const line of wrap(text, font, size, width - indent)) {
      ensure(lineHeight);
      page.drawText(line, { x: margin + indent, y, size, font, color: TEXT });
      y -= lineHeight;
    }
    y -= options?.gap ?? 4;
  };
  const drawSignature = (role: AgreementSignerRole, fallback: string) => {
    const signature = signing?.signatures[role];
    const image = signatureImages.get(role);
    if (!signature || !image) { draw(fallback); return; }
    ensure(72);
    page.drawImage(image, { x: margin, y: y - 40, width: 140, height: 46 });
    y -= 46;
    draw(`Electronically signed by ${signature.signerName}\n${new Date(signature.signedAt).toLocaleString('en-NG')} | Verification ref ${signature.signatureHash.slice(0, 16).toUpperCase()}`, { size: 7.2 });
  };

  addPage();
  page.drawText('MURABAHA SALES CONTRACT AGREEMENT', { x: margin, y, size: 15, font: bold, color: GREEN });
  y -= 23;
  draw(`Agreement Reference: ${model.agreementId}`, { font: bold });
  draw(`Effective Date: ${formatAgreementDate(model.agreementDate)}`);
  const summary = [
    ['Customer', model.client.name],
    ['Approved Assets', model.deal.assetDescription],
    ['Cost Price', formatAgreementCurrency(model.deal.costPrice)],
    ['Murabaha Profit', `${formatAgreementCurrency(model.deal.profit)} (${model.deal.profitRate}% of Cost Price)`],
    ['Contract Price', formatAgreementCurrency(model.deal.contractPrice)],
    ['Tenor', `${model.deal.durationValue} ${model.deal.durationUnit}`],
    ['Repayments', `${model.deal.installmentCount} ${model.deal.repaymentFrequency} instalments`],
    ['Management Fee', `${formatAgreementCurrency(model.deal.managementFeeAmount)} (${model.deal.managementFeeRate}% of Cost Price; separate from Contract Price)`],
  ];
  for (const [label, value] of summary) draw(`${label}: ${value}`, { size: 8.3, gap: 2 });
  y -= 5;
  draw(`THIS MURABAHA SALES CONTRACT AGREEMENT (the “Agreement”) is made on ${formatAgreementDate(model.agreementDate)} between:`, { font: bold });
  draw('PARTIES', { font: bold, size: 10 });
  draw(`${model.company.name}, RC No. ${model.company.rcNumber}, of ${model.company.address} (the “Company” or “Seller”); and`);
  draw(`${model.client.name.toUpperCase()}, of ${model.client.address} (the “Customer” or “Buyer”).`);
  draw('The Company and the Customer are collectively referred to as the “Parties”.');
  draw('RECITALS', { font: bold, size: 10 });
  draw(`A. The Customer has requested the Company to purchase ${model.deal.assetDescription} and resell the assets to the Customer on a disclosed cost-plus-profit basis.`);
  draw('B. The Customer has agreed to purchase the assets from the Company at the Contract Price and to pay by the agreed instalments.');
  draw('C. The Parties intend this transaction to comply with applicable Nigerian law and the principles of Islamic commercial jurisprudence.');
  draw('NOW IT IS AGREED AS FOLLOWS:', { font: bold });
  for (const clause of buildMurabahaClauses(model)) {
    ensure(34);
    draw(`${clause.number}. ${clause.title}`, { font: bold, size: 9.3, gap: 2 });
    clause.paragraphs.forEach((paragraph) => draw(paragraph, { size: 8.25, gap: 5 }));
  }

  ensure(stamp ? 445 : 300);
  draw('EXECUTION', { font: bold, size: 10.5 });
  draw('IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first written above.', { font: italic });
  draw('FOR AND ON BEHALF OF NAL GENERAL MERCHANT LTD', { font: bold });
  drawSignature('NAL_SIGNATORY_1', 'Name: ______________________________\nCapacity: Authorised Signatory 1\nSignature: __________________________    Date: ____________________');
  drawSignature('NAL_SIGNATORY_2', 'Name: ______________________________\nCapacity: Authorised Signatory 2\nSignature: __________________________    Date: ____________________');
  if (executed && stamp) {
    ensure(125);
    page.drawText('NAL COMPANY STAMP / SEAL', { x: margin, y, size: 8.5, font: bold, color: TEXT });
    page.drawImage(stamp, { x: margin, y: y - 114, width: 170, height: 112 });
    y -= 124;
  }
  ensure(150);
  draw('SIGNED BY THE CUSTOMER', { font: bold });
  if (photo) page.drawImage(photo, { x: A4[0] - margin - 65, y: y - 72, width: 58, height: 70 });
  draw(`Name: ${model.client.name.toUpperCase()}\nAddress: ${model.client.address}`, { gap: 1 });
  drawSignature('CLIENT', 'Signature: __________________________    Date: ____________________');
  draw('IN THE PRESENCE OF A WITNESS', { font: bold });
  drawSignature('WITNESS', 'Name: ______________________________\nAddress: ____________________________\nPhone No.: __________________________\nOccupation: _________________________\nSignature: __________________________    Date: ____________________');
  draw('GUARANTOR DETAILS', { font: bold });
  draw(`Name: ${model.guarantor.name}\nAddress: ${model.guarantor.address}\nPhone: ${model.guarantor.phoneNumber}\nOccupation: ${model.guarantor.occupation || 'Not recorded'}`, { gap: 1 });
  drawSignature('GUARANTOR', 'Signature: __________________________    Date: ____________________');

  if (verification && verificationQr) {
    ensure(106);
    page.drawRectangle({ x: margin, y: y - 88, width, height: 92, borderColor: GREEN, borderWidth: 1, color: rgb(0.965, 0.99, 0.98) });
    page.drawImage(verificationQr, { x: margin + 8, y: y - 80, width: 74, height: 74 });
    page.drawText('SCAN TO VERIFY THIS EXECUTED AGREEMENT', { x: margin + 94, y: y - 19, size: 8.8, font: bold, color: GREEN });
    page.drawText(`Reference: ${verification.reference.slice(0, 24).toUpperCase()}`, { x: margin + 94, y: y - 37, size: 7.3, font: regular, color: TEXT });
    page.drawText('Opens the official NAL authenticity register at nalgm.com', { x: margin + 94, y: y - 53, size: 6.8, font: regular, color: MUTED });
    y -= 98;
  }

  addPage();
  page.drawText('ATTACHMENT A — DATED REPAYMENT SCHEDULE', { x: margin, y, size: 12, font: bold, color: GREEN });
  y -= 20;
  draw(`${model.agreementId} | ${model.client.name} | Contract Price ${formatAgreementCurrency(model.deal.contractPrice)}`, { size: 7.5 });
  const columns = [24, 58, 77, 66, 66, 72, 77, 57];
  const headings = ['SN', 'Due Date', 'Opening', 'Profit', 'Principal', 'Instalment', 'Closing', 'Status'];
  const drawTableHeader = () => {
    const rowHeight = 24;
    let x = margin;
    headings.forEach((heading, index) => {
      page.drawRectangle({ x, y: y - rowHeight, width: columns[index], height: rowHeight, color: TABLE_HEADER, borderColor: rgb(0.35, 0.4, 0.45), borderWidth: 0.5 });
      page.drawText(heading, { x: x + 2, y: y - 15, size: 6.2, font: bold, color: rgb(1, 1, 1) });
      x += columns[index];
    });
    y -= rowHeight;
  };
  drawTableHeader();
  model.deal.schedule.forEach((row, index) => {
    const rowHeight = 17;
    if (y - rowHeight < 52) { addPage(); page.drawText('ATTACHMENT A — DATED REPAYMENT SCHEDULE (CONTINUED)', { x: margin, y, size: 9, font: bold, color: GREEN }); y -= 16; drawTableHeader(); }
    const values = [
      String(row.installment),
      new Date(row.dueDate).toLocaleDateString('en-GB'),
      shortMoney(row.openingBalance),
      shortMoney(row.profit),
      shortMoney(row.principal),
      shortMoney(row.payment),
      shortMoney(row.closingBalance),
      'Scheduled',
    ];
    let x = margin;
    values.forEach((value, columnIndex) => {
      page.drawRectangle({ x, y: y - rowHeight, width: columns[columnIndex], height: rowHeight, color: index % 2 ? TABLE_ALT : rgb(1, 1, 1), borderColor: rgb(0.45, 0.5, 0.55), borderWidth: 0.4 });
      const fitted = value.length > 19 ? value.slice(0, 19) : value;
      page.drawText(safe(fitted), { x: x + 1.5, y: y - 11, size: columnIndex === 0 ? 5.7 : 5.2, font: columnIndex === 5 ? bold : regular, color: TEXT });
      x += columns[columnIndex];
    });
    y -= rowHeight;
  });
  y -= 8;
  draw('The complete dated payment schedule, asset invoices and all guarantee or security documents form part of this Agreement.', { font: italic, size: 7.5 });

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    if (!executed) pdfPage.drawText('DRAFT - NOT FULLY EXECUTED', { x: 100, y: 390, size: 27, font: bold, color: rgb(0.75, 0.08, 0.08), rotate: degrees(35), opacity: 0.11 });
    const footer = `${model.company.name} | RC No. ${model.company.rcNumber} | ${model.company.email} | ${model.company.website} | Page ${index + 1} of ${pages.length}`;
    pdfPage.drawLine({ start: { x: margin, y: 35 }, end: { x: A4[0] - margin, y: 35 }, thickness: 0.6, color: GREEN });
    pdfPage.drawText(safe(wrap(footer, regular, 6.2, width)[0]), { x: margin, y: 22, size: 6.2, font: regular, color: MUTED });
  });
  return pdf.save();
}
