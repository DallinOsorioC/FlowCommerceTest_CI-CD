import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { QuotePdfRenderer } from '../../application/ports/quote-pdf.renderer';
import {
  formatDate,
  formatMoney,
  type QuoteDocument,
} from '../../domain/quote-document';

const MARGIN = 50;
const ACCENT = '#4F46E5';
const MUTED = '#6B7280';
// Columnas de la tabla de partidas (x en puntos; carta = 612 de ancho).
const COLUMNS = {
  description: MARGIN,
  quantity: 300,
  unitPrice: 350,
  discount: 430,
  total: 480,
};

// PDF de la cotización con pdfkit (tamaño carta). Fuentes estándar
// (Helvetica): soportan acentos y ñ sin incrustar archivos de fuente.
@Injectable()
export class PdfkitQuotePdfRenderer implements QuotePdfRenderer {
  render(quote: QuoteDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: MARGIN,
        info: {
          Title: `Cotización ${quote.folio}`,
          Author: quote.company.name,
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.header(doc, quote);
      this.parties(doc, quote);
      this.itemsTable(doc, quote);
      this.totals(doc, quote);
      this.footer(doc, quote);

      doc.end();
    });
  }

  private header(doc: PDFKit.PDFDocument, quote: QuoteDocument): void {
    const company = quote.company;
    doc
      .fillColor(ACCENT)
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(company.legalName ?? company.name, MARGIN, MARGIN);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    for (const line of [
      company.taxId ? `NIT: ${company.taxId}` : null,
      company.address,
      [company.phone, company.email].filter(Boolean).join(' · ') || null,
    ]) {
      if (line) doc.text(line);
    }

    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(`COTIZACIÓN ${quote.folio}`, 330, MARGIN, {
        width: 232,
        align: 'right',
      });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Emitida: ${formatDate(quote.issuedAt)}`, 330, doc.y, {
        width: 232,
        align: 'right',
      })
      .text(
        `Válida hasta: ${quote.validUntil ? formatDate(quote.validUntil) : 'Sin vencimiento'}`,
        330,
        doc.y,
        { width: 232, align: 'right' },
      );
    if (quote.origin === 'AI') {
      doc
        .fillColor(ACCENT)
        .text('Generada con IA', 330, doc.y, { width: 232, align: 'right' });
    }
    doc.moveDown(3);
  }

  private parties(doc: PDFKit.PDFDocument, quote: QuoteDocument): void {
    const top = Math.max(doc.y, 140);
    const block = (x: number, title: string, lines: (string | null)[]) => {
      doc
        .fillColor(ACCENT)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(title, x, top, { width: 240 });
      doc.fillColor('#111827').font('Helvetica').fontSize(9);
      for (const line of lines) {
        if (line) doc.text(line, x, doc.y, { width: 240 });
      }
      return doc.y;
    };
    const customer = quote.customer;
    const leftEnd = block(MARGIN, 'Cliente', [
      customer.company ?? customer.name,
      customer.company
        ? `Contacto: ${customer.name}${customer.contactPosition ? ` (${customer.contactPosition})` : ''}`
        : (customer.contactPosition ?? null),
      customer.taxId ? `NIT: ${customer.taxId}` : null,
      customer.email,
      customer.phone,
    ]);
    const advisor = quote.advisor;
    const rightEnd = advisor
      ? block(320, 'Asesor', [
          advisor.name,
          advisor.position,
          advisor.email,
          advisor.phone,
        ])
      : top;
    doc.y = Math.max(leftEnd, rightEnd) + 20;
  }

  private itemsTable(doc: PDFKit.PDFDocument, quote: QuoteDocument): void {
    const money = (value: number) => formatMoney(value, quote.currency);
    const row = (
      cells: [string, string, string, string, string],
      bold = false,
    ) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.text(cells[0], COLUMNS.description, y, { width: 240 });
      const end = doc.y;
      doc.text(cells[1], COLUMNS.quantity, y, { width: 45, align: 'right' });
      doc.text(cells[2], COLUMNS.unitPrice, y, { width: 75, align: 'right' });
      doc.text(cells[3], COLUMNS.discount, y, { width: 45, align: 'right' });
      doc.text(cells[4], COLUMNS.total, y, { width: 82, align: 'right' });
      doc.y = Math.max(end, doc.y) + 6;
    };

    doc.fillColor(MUTED);
    row(['Descripción', 'Cant.', 'Precio', 'Desc.', 'Total'], true);
    doc
      .moveTo(MARGIN, doc.y - 3)
      .lineTo(562, doc.y - 3)
      .strokeColor('#E5E7EB')
      .stroke();
    doc.fillColor('#111827');
    if (quote.items.length === 0) {
      row(['(Sin partidas)', '', '', '', '']);
    }
    for (const item of quote.items) {
      if (doc.y > 680) doc.addPage();
      row([
        item.description,
        String(item.quantity),
        money(item.unitPrice),
        item.discountPercent ? `${item.discountPercent}%` : '—',
        money(item.lineTotal),
      ]);
    }
    doc.moveDown();
  }

  private totals(doc: PDFKit.PDFDocument, quote: QuoteDocument): void {
    const money = (value: number) => formatMoney(value, quote.currency);
    const line = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 9)
        .text(label, 330, y, { width: 140, align: 'right' })
        .text(value, 480, y, { width: 82, align: 'right' });
      doc.moveDown(0.4);
    };
    if (doc.y > 650) doc.addPage();
    doc.fillColor('#111827');
    line('Subtotal', money(quote.subtotal));
    if (quote.discount) line('Descuento', `-${money(quote.discount)}`);
    if (quote.adjustment) {
      line('Ajuste comercial', `-${money(quote.adjustment)}`);
    }
    line(`IVA (${quote.taxPercent}%)`, money(quote.tax));
    doc.fillColor(ACCENT);
    line('Total', money(quote.total), true);
    doc.fillColor('#111827').moveDown();
  }

  private footer(doc: PDFKit.PDFDocument, quote: QuoteDocument): void {
    for (const [title, text] of [
      ['Notas', quote.notes],
      ['Condiciones', quote.terms],
      ['Pagar en línea', quote.paymentLinkUrl ?? null],
    ] as const) {
      if (!text) continue;
      if (doc.y > 680) doc.addPage();
      doc
        .fillColor(ACCENT)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(title, MARGIN, doc.y);
      doc
        .fillColor('#111827')
        .font('Helvetica')
        .fontSize(9)
        .text(text, MARGIN, doc.y, { width: 512 });
      doc.moveDown();
    }
  }
}
