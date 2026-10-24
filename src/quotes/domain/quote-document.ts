// Todo lo que aparece en el documento de una cotización (PDF y correo). Lo
// arma QuoteDocumentBuilder a partir de la cotización, el proyecto, el
// cliente o lead y el asesor; el renderer solo dibuja.
export interface QuoteDocument {
  folio: string;
  status: string;
  issuedAt: Date;
  validUntil: Date | null;
  currency: string;
  company: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  customer: {
    name: string;
    company: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    // Cargo del contacto (N9).
    contactPosition?: string | null;
  };
  advisor: {
    name: string;
    email: string;
    phone: string | null;
    position: string | null;
  } | null;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  adjustment: number;
  taxPercent: number;
  tax: number;
  total: number;
  notes: string | null;
  terms: string | null;
  // AI = se marca «Generada con IA» en el documento (N7).
  origin?: string;
  // Link de pago del servicio de Pagos, si ya existe.
  paymentLinkUrl?: string | null;
}

// "Q1,234.50" según la moneda del proyecto (GTQ por defecto).
export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

export const quoteFilename = (folio: string) =>
  `${folio.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
