import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '../exceptions/domain.exceptions';
import { SecretCipher } from './secret-cipher';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

const cipherWith = (key: string | undefined) =>
  new SecretCipher({
    get: () => key,
  } as unknown as ConfigService);

describe('SecretCipher', () => {
  it('round-trips a secret and never stores it in clear', () => {
    const cipher = cipherWith(KEY_A);
    const stored = cipher.encrypt('EAAG-token');

    expect(stored).not.toContain('EAAG-token');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(cipher.decrypt(stored)).toBe('EAAG-token');
  });

  it('uses a fresh IV each time', () => {
    const cipher = cipherWith(KEY_A);
    expect(cipher.encrypt('x')).not.toBe(cipher.encrypt('x'));
  });

  it('refuses to decrypt with another key', () => {
    const stored = cipherWith(KEY_A).encrypt('secret');
    expect(() => cipherWith(KEY_B).decrypt(stored)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('detects tampering', () => {
    const cipher = cipherWith(KEY_A);
    const [v, iv, tag, data] = cipher.encrypt('secret').split(':');
    const tampered = [
      v,
      iv,
      tag,
      Buffer.from('zz').toString('base64url') + data,
    ];
    expect(() => cipher.decrypt(tampered.join(':'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails closed without a valid ENCRYPTION_KEY', () => {
    expect(() => cipherWith(undefined).encrypt('x')).toThrow(
      ServiceUnavailableException,
    );
    expect(() => cipherWith('short').encrypt('x')).toThrow(
      ServiceUnavailableException,
    );
  });
});
