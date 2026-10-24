import { parseCorsOrigins } from './cors';

describe('parseCorsOrigins', () => {
  it('reads a comma-separated list from CORS_ORIGINS', () => {
    expect(
      parseCorsOrigins(
        'http://localhost:5173, https://app.flowcommerce.com',
        undefined,
      ),
    ).toEqual(['http://localhost:5173', 'https://app.flowcommerce.com']);
  });

  it('falls back to APP_URL when CORS_ORIGINS is empty', () => {
    expect(parseCorsOrigins('  ', 'http://localhost:5173')).toEqual([
      'http://localhost:5173',
    ]);
  });

  it('strips trailing slashes so they match the Origin header', () => {
    expect(parseCorsOrigins('http://localhost:5173/', undefined)).toEqual([
      'http://localhost:5173',
    ]);
  });

  it('never allows the wildcard origin', () => {
    expect(parseCorsOrigins('*, http://localhost:5173', undefined)).toEqual([
      'http://localhost:5173',
    ]);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(parseCorsOrigins(undefined, undefined)).toEqual([]);
  });
});
