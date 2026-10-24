import { formatDate, formatMoney, quoteFilename } from './quote-document';

describe('quote document helpers', () => {
  it('formats money in the project currency', () => {
    // El espacio tras el símbolo depende de la versión de ICU de Node.
    expect(formatMoney(1234.5, 'GTQ')).toMatch(/^Q\s?1,234\.50$/);
    expect(formatMoney(10, 'USD')).toContain('10.00');
  });

  it('falls back when the currency code is not valid', () => {
    expect(formatMoney(5, 'XX')).toBe('XX 5.00');
  });

  it('formats dates as dd/mm/yyyy in UTC', () => {
    expect(formatDate(new Date('2026-10-05T23:00:00Z'))).toBe('05/10/2026');
  });

  it('builds a safe file name from the folio', () => {
    expect(quoteFilename('COT-000028')).toBe('COT-000028.pdf');
    expect(quoteFilename('COT/../x')).toBe('COT____x.pdf');
  });
});
