import type { QuoteDocument } from '../../domain/quote-document';

// Puerto para dibujar el PDF de una cotización. La aplicación no sabe qué
// librería se usa (hoy pdfkit, en infrastructure/pdf).
export interface QuotePdfRenderer {
  render(document: QuoteDocument): Promise<Buffer>;
}

export const QUOTE_PDF_RENDERER = Symbol('QUOTE_PDF_RENDERER');
