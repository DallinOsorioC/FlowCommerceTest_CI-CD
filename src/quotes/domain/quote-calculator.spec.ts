import { AdjustmentExceedsBaseError, calculateQuote } from './quote-calculator';

describe('calculateQuote', () => {
  it('returns zeros for an empty quote', () => {
    expect(calculateQuote([], 19)).toEqual({
      lines: [],
      subtotal: 0,
      discount: 0,
      adjustment: 0,
      taxPercent: 19,
      tax: 0,
      total: 0,
    });
  });

  it('applies line discount, then tax on the discounted base', () => {
    const result = calculateQuote(
      [
        { quantity: 2, unitPrice: 500, discountPercent: 10 },
        { quantity: 1, unitPrice: 250.5, discountPercent: 0 },
      ],
      19,
    );

    // bruto 1250.50; descuento 100; base 1150.50; IVA 218.595 -> 218.60.
    expect(result.subtotal).toBe(1250.5);
    expect(result.discount).toBe(100);
    expect(result.tax).toBe(218.6);
    expect(result.total).toBe(1369.1);
    expect(result.lines.map((line) => line.lineTotal)).toEqual([900, 250.5]);
  });

  it('is exact where floating point would drift', () => {
    // 0.1 + 0.2 != 0.3 en coma flotante; 3 x 0.1 = 0.30 exacto aquí.
    const result = calculateQuote(
      [{ quantity: 3, unitPrice: 0.1, discountPercent: 0 }],
      0,
    );
    expect(result.subtotal).toBe(0.3);
    expect(result.total).toBe(0.3);
  });

  it('rounds half-up to cents per line', () => {
    const result = calculateQuote(
      [{ quantity: 1, unitPrice: 0.05, discountPercent: 10 }],
      0,
    );
    // descuento 0.005 -> 0.01
    expect(result.discount).toBe(0.01);
    expect(result.total).toBe(0.04);
  });

  it('keeps total = subtotal - discount + tax', () => {
    const result = calculateQuote(
      [
        { quantity: 7, unitPrice: 33.33, discountPercent: 12.5 },
        { quantity: 1.5, unitPrice: 99.99, discountPercent: 3.25 },
      ],
      16,
    );
    expect(result.total).toBeCloseTo(
      result.subtotal - result.discount + result.tax,
      2,
    );
  });

  describe('commercial adjustment', () => {
    it('subtracts the adjustment before computing tax', () => {
      const result = calculateQuote(
        [{ quantity: 12, unitPrice: 1450, discountPercent: 10 }],
        12,
        660,
      );
      // bruto 17400; descuento 1740; ajuste 660; base 15000; IVA 1800.
      expect(result.subtotal).toBe(17400);
      expect(result.discount).toBe(1740);
      expect(result.adjustment).toBe(660);
      expect(result.tax).toBe(1800);
      expect(result.total).toBe(16800);
    });

    it('keeps total = subtotal - discount - adjustment + tax', () => {
      const result = calculateQuote(
        [{ quantity: 3, unitPrice: 99.99, discountPercent: 5 }],
        12,
        10.55,
      );
      expect(result.total).toBeCloseTo(
        result.subtotal - result.discount - result.adjustment + result.tax,
        2,
      );
    });

    it('allows an adjustment equal to the discounted subtotal (total 0)', () => {
      const result = calculateQuote(
        [{ quantity: 1, unitPrice: 100, discountPercent: 0 }],
        12,
        100,
      );
      expect(result.total).toBe(0);
      expect(result.tax).toBe(0);
    });

    it('rejects an adjustment above the discounted subtotal', () => {
      expect(() =>
        calculateQuote(
          [{ quantity: 1, unitPrice: 100, discountPercent: 10 }],
          12,
          90.01,
        ),
      ).toThrow(AdjustmentExceedsBaseError);
    });
  });
});
