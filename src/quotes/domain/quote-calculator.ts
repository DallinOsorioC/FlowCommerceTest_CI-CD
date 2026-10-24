// Cálculo de importes de una cotización. Función pura y sin coma flotante: todo
// se hace en céntimos enteros (BigInt) con redondeo half-up, para que el total
// que ve el cliente coincida exactamente con el que guarda numeric(14,2).
//
// Fórmula:
//   subtotal   = Σ cantidad × precio                (bruto de las partidas)
//   discount   = Σ descuento de cada partida
//   adjustment = ajuste comercial (descuento global de la cotización)
//   base       = subtotal − discount − adjustment   (lo que paga IVA)
//   tax        = base × IVA%
//   total      = base + tax
//
// El ajuste se resta ANTES del IVA: así el impuesto se calcula sobre el precio
// que realmente se cobra.

export interface CalculatorLineInput {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

export interface CalculatedLine {
  // quantity * unitPrice, antes del descuento de la línea.
  gross: number;
  discount: number;
  // gross - discount (antes de IVA): es lo que se guarda en line_total.
  lineTotal: number;
}

export interface CalculatedTotals {
  subtotal: number;
  discount: number;
  adjustment: number;
  taxPercent: number;
  tax: number;
  total: number;
}

export interface CalculatedQuote extends CalculatedTotals {
  lines: CalculatedLine[];
}

// El ajuste comercial no puede dejar la base en negativo.
export class AdjustmentExceedsBaseError extends Error {
  constructor(
    readonly adjustment: number,
    readonly maxAdjustment: number,
  ) {
    super(
      `Commercial adjustment ${adjustment} exceeds the amount after line discounts (${maxAdjustment})`,
    );
    this.name = 'AdjustmentExceedsBaseError';
  }
}

const toHundredths = (value: number): bigint => BigInt(Math.round(value * 100));
const fromCents = (cents: bigint): number => Number(cents) / 100;

// Cociente entero redondeado half-up (operandos no negativos).
const divRound = (numerator: bigint, denominator: bigint): bigint =>
  (numerator * 2n + denominator) / (denominator * 2n);

export function calculateQuote(
  lines: readonly CalculatorLineInput[],
  taxPercent: number,
  adjustment = 0,
): CalculatedQuote {
  let subtotal = 0n;
  let discount = 0n;

  const calculated = lines.map((line) => {
    // Cantidad y porcentaje tienen 2 decimales: se trabajan como centésimas.
    const gross = divRound(
      toHundredths(line.quantity) * toHundredths(line.unitPrice),
      100n,
    );
    const lineDiscount = divRound(
      gross * toHundredths(line.discountPercent),
      10000n,
    );
    subtotal += gross;
    discount += lineDiscount;

    return {
      gross: fromCents(gross),
      discount: fromCents(lineDiscount),
      lineTotal: fromCents(gross - lineDiscount),
    };
  });

  const afterLineDiscounts = subtotal - discount;
  const adjustmentCents = toHundredths(adjustment);
  if (adjustmentCents > afterLineDiscounts) {
    throw new AdjustmentExceedsBaseError(
      fromCents(adjustmentCents),
      fromCents(afterLineDiscounts),
    );
  }

  const base = afterLineDiscounts - adjustmentCents;
  const tax = divRound(base * toHundredths(taxPercent), 10000n);

  return {
    lines: calculated,
    subtotal: fromCents(subtotal),
    discount: fromCents(discount),
    adjustment: fromCents(adjustmentCents),
    taxPercent,
    tax: fromCents(tax),
    total: fromCents(base + tax),
  };
}
