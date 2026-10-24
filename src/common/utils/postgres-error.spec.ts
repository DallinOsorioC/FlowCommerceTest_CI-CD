import {
  isForeignKeyViolation,
  isUniqueViolation,
  violatedConstraint,
} from './postgres-error';

describe('postgres error helpers', () => {
  it('detects a unique violation at the top level', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('detects a unique violation wrapped by Drizzle in error.cause', () => {
    const wrapped = new Error('query failed', {
      cause: { code: '23505' },
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it('detects a foreign key violation', () => {
    expect(isForeignKeyViolation({ cause: { code: '23503' } })).toBe(true);
  });

  it('exposes the violated constraint name', () => {
    expect(
      violatedConstraint({
        cause: { code: '23503', constraint_name: 'leads_client_fk' },
      }),
    ).toBe('leads_client_fk');
    expect(violatedConstraint(new Error('boom'))).toBeUndefined();
  });

  it('ignores other errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });
});
