import { API_KEY_PREFIX, generateApiKey, hashApiKey } from './api-key';

describe('API keys', () => {
  it('generates a prefixed random key and stores only its hash', () => {
    const first = generateApiKey();
    const second = generateApiKey();

    expect(first.key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(first.key).not.toBe(second.key);
    expect(first.prefix).toBe(first.key.slice(0, 12));
    expect(first.hash).toBe(hashApiKey(first.key));
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toContain(first.key);
  });
});
