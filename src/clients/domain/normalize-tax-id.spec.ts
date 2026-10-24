import { normalizeTaxId } from './normalize-tax-id';

describe('normalizeTaxId', () => {
  it.each([
    ['7745213-8', '77452138'],
    ['77452138', '77452138'],
    [' 7745213 8 ', '77452138'],
    ['12.345.678-k', '12345678K'],
    ['cf', 'CF'],
    [' - ', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTaxId(input)).toBe(expected);
  });

  it('keeps null and undefined', () => {
    expect(normalizeTaxId(null)).toBeNull();
    expect(normalizeTaxId(undefined)).toBeUndefined();
  });
});
