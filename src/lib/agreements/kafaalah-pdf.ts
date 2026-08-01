import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatAgreementCurrency, formatAgreementDate } from './mudaraba';
import { buildKafaalahClauses, type KafaalahBondModel } from './kafaalah';

const A4: [number, number] = [595.28, 841.89];
const GREEN = rgb(0.027, 0.353, 0.235);
const TEXT = rgb(0.08, 0.1, 0.14);
const MUTED = rgb(0.35, 0.39, 0.45);
function safe(text: string) { return text.replace(/₦/g, 'NGN ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' '); }
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= width) line = candidate; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line); if (!paragraph.trim()) lines.push('');
  }
  return lines;
}
async function fetchBytes(url: string): Promise<Uint8Array | null> { try { const response = await fetch(url); return response.ok ? new Uint8Array(await response.arrayBuffer()) : null; } catch { return null; } }

export async function buildKafaalahBondPdf(model: KafaalahBondModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Kafaalah Bond - ${model.guarantor.name}`); pdf.setAuthor(model.company.name); pdf.setSubject(model.bondId);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman); const bold = await pdf.embedFont(StandardFonts.TimesRomanBold); const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const logoBytes = typeof window !== 'undefined' ? await fetchBytes(new URL('/NAL%20LOGO.jpg', window.location.origin).toString()) : null;
  const logo = logoBytes ? await pdf.embedJpg(logoBytes).catch(() => null) : null;
  const photoBytes = model.guarantor.photoURL ? await fetchBytes(model.guarantor.photoURL) : null;
  const photo = photoBytes ? await (async () => { try { return await pdf.embedJpg(photoBytes); } catch { try { return await pdf.embedPng(photoBytes); } catch { return null; } } })() : null;
  let page!: PDFPage; let y = 0; const margin = 48; const width = A4[0] - margin * 2;
  const addPage = () => { page = pdf.addPage(A4); y = A4[1] - 45; if (logo) page.drawImage(logo, { x: margin, y: y - 28, width: 38, height: 30 }); page.drawText(safe(model.company.name), { x: margin + 47, y: y - 10, size: 10.5, font: bold, color: GREEN }); page.drawText(safe(model.company.address), { x: margin + 47, y: y - 24, size: 6.8, font: regular, color: MUTED }); page.drawLine({ start: { x: margin, y: y - 36 }, end: { x: A4[0] - margin, y: y - 36 }, thickness: 1.2, color: GREEN }); y -= 57; };
  const ensure = (height: number) => { if (y - height < 55) addPage(); };
  const draw = (text: string, options?: { font?: PDFFont; size?: number; gap?: number }) => { const font = options?.font || regular; const size = options?.size || 9; const height = size * 1.38; for (const line of wrap(text, font, size, width)) { ensure(height); page.drawText(line, { x: margin, y, size, font, color: TEXT }); y -= height; } y -= options?.gap ?? 5; };
  addPage();
  page.drawText('KAFAALAH BOND', { x: margin, y, size: 17, font: bold, color: GREEN }); y -= 20; page.drawText('GUARANTEE AND INDEMNITY', { x: margin, y, size: 11, font: bold, color: TEXT }); y -= 24;
  draw(`Bond Reference: ${model.bondId}`, { font: bold }); draw(`Principal Agreement: ${model.deal.name} (${model.deal.financingMode})`); draw(`Contract Amount: ${formatAgreementCurrency(model.deal.principal)}`);
  draw(`THIS BOND OF KAFAALAH (GUARANTEE) is made this ${formatAgreementDate(model.bondDate)} by ${model.guarantor.name.toUpperCase()}, of ${model.guarantor.address} (hereinafter referred to as the “Guarantor” or “Kafeel”).`, { font: bold });
  draw('WHEREAS', { font: bold, size: 10 });
  draw(`The Guarantor has agreed to guarantee the obligations of ${model.client.name.toUpperCase()}, of ${model.client.address} (hereinafter referred to as the “Customer”), under the substantive agreement dated ${formatAgreementDate(model.principalAgreementDate)} between the Customer and ${model.company.name} (the “Principal Agreement”).`);
  draw('The Guarantor agrees to secure the Customer’s performance of the terms and obligations contained in the Principal Agreement.');
  draw('NOW THIS DEED WITNESSES AS FOLLOWS', { font: bold, size: 10 });
  for (const clause of buildKafaalahClauses(model)) { ensure(35); draw(`${clause.number}. ${clause.title}`, { font: bold, size: 9.4, gap: 2 }); draw(clause.body, { size: 8.5, gap: 8 }); }
  ensure(190); draw('EXECUTION', { font: bold, size: 11 }); draw(`DATED this ${formatAgreementDate(model.bondDate)}.`, { font: bold }); draw('IN WITNESS WHEREOF, the Guarantor has executed this Bond on the date stated above.', { font: italic });
  if (photo) page.drawImage(photo, { x: A4[0] - margin - 72, y: y - 75, width: 62, height: 72 });
  draw('SIGNED BY THE GUARANTOR', { font: bold }); draw(`Name: ${model.guarantor.name.toUpperCase()}\nCapacity: Guarantor / Kafeel\nPhone Number: ${model.guarantor.phoneNumber}\nOccupation: ${model.guarantor.occupation}\nSignature: ________________________    Date: ____________________`);
  draw('IN THE PRESENCE OF A WITNESS', { font: bold }); draw('Name: ______________________________\nPhone Number: _______________________\nAddress: ____________________________\nOccupation: _________________________\nSignature: __________________________    Date: ____________________');
  draw('This Bond should be reviewed by a Nigerian legal practitioner and qualified Sharia adviser before execution.', { font: italic, size: 8 });
  const pages = pdf.getPages(); pages.forEach((pdfPage, index) => { const footer = `${model.company.name} | RC No. ${model.company.rcNumber} | ${model.company.email} | ${model.company.website} | Tel: ${model.company.phoneNumbers} | Page ${index + 1} of ${pages.length}`; pdfPage.drawLine({ start: { x: margin, y: 35 }, end: { x: A4[0] - margin, y: 35 }, thickness: 0.6, color: GREEN }); pdfPage.drawText(safe(wrap(footer, regular, 6.5, width)[0]), { x: margin, y: 22, size: 6.5, font: regular, color: MUTED }); });
  return pdf.save();
}
