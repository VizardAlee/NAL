import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatAgreementCurrency, formatAgreementDate } from './mudaraba';
import { buildWakalahClauses, type WakalahAgreementModel } from './wakalah';

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

export async function buildWakalahAgreementPdf(model: WakalahAgreementModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Wakalah Agreement - ${model.client.name}`);
  pdf.setAuthor(model.company.name);
  pdf.setSubject(model.agreementId);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const logoBytes = typeof window !== 'undefined' ? await fetchBytes(new URL('/NAL%20LOGO.jpg', window.location.origin).toString()) : null;
  const logo = logoBytes ? await pdf.embedJpg(logoBytes).catch(() => null) : null;
  const stampBytes = typeof window !== 'undefined' ? await fetchBytes(new URL('/nal-stamp.png', window.location.origin).toString()) : null;
  const stamp = stampBytes ? await pdf.embedPng(stampBytes).catch(() => null) : null;
  const institutionBytes = typeof window !== 'undefined' ? await fetchBytes(new URL('/non-interest-institution.png', window.location.origin).toString()) : null;
  const institutionMark = institutionBytes ? await pdf.embedPng(institutionBytes).catch(() => null) : null;
  const photoBytes = model.client.photoURL ? await fetchBytes(model.client.photoURL) : null;
  const photo = photoBytes ? await (async () => {
    try { return await pdf.embedJpg(photoBytes); } catch { try { return await pdf.embedPng(photoBytes); } catch { return null; } }
  })() : null;

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
  draw('Name: NURA LABARAN NUHU\nCapacity: Director\nSignature: ________________________    Date: ____________________\n\nName: NAZIR SHARIF FILLO\nCapacity: Director\nSignature: ________________________    Date: ____________________');
  if (stamp) {
    ensure(130);
    page.drawText('NAL COMPANY STAMP / SEAL', { x: margin, y, size: 8.5, font: bold, color: TEXT });
    page.drawImage(stamp, { x: margin, y: y - 120, width: 180, height: 120 });
    y -= 130;
  }
  draw('SIGNED BY THE CUSTOMER', { font: bold });
  draw(`Name: ${model.client.name.toUpperCase()}\nCapacity: Customer / Wakil\nSignature: ________________________    Date: ____________________`);
  draw('IN THE PRESENCE OF A WITNESS', { font: bold });
  draw('Name: ______________________________\nPhone Number: _______________________\nAddress: ____________________________\nOccupation: _________________________\nSignature: __________________________    Date: ____________________');

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    const footer = `${model.company.name} | RC No. ${model.company.rcNumber} | ${model.company.email} | ${model.company.website} | Tel: ${model.company.phoneNumbers} | Page ${index + 1} of ${pages.length}`;
    pdfPage.drawLine({ start: { x: margin, y: 35 }, end: { x: A4[0] - margin, y: 35 }, thickness: 0.6, color: GREEN });
    pdfPage.drawText(safe(wrap(footer, regular, 6.5, width)[0]), { x: margin, y: 22, size: 6.5, font: regular, color: MUTED });
  });
  return pdf.save();
}
