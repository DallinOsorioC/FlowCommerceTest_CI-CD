import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '../exceptions/domain.exceptions';

const VERSION = 'v1';
const KEY_HEX = /^[0-9a-fA-F]{64}$/;

// Cifra secretos que sí hay que recuperar en claro (tokens de WhatsApp, el
// secreto de firma de los webhooks salientes). Para lo que solo se compara
// (API keys) se usa un hash, no esto.
//
// AES-256-GCM con la clave ENCRYPTION_KEY (64 caracteres hex = 32 bytes):
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Formato guardado: "v1:<iv>:<tag>:<texto cifrado>" en base64url. Rotar la
// clave deja ilegibles los secretos anteriores: hay que volver a guardarlos.
@Injectable()
export class SecretCipher {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      VERSION,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  // Lanza si el valor no es de esta clave o fue alterado (GCM autentica).
  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split(':');
    if (version !== VERSION || !iv || !tag || !data) {
      throw new ServiceUnavailableException(
        'Stored secret has an unknown format',
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException(
        'Stored secret cannot be decrypted (was ENCRYPTION_KEY rotated?). Save it again.',
      );
    }
  }

  private key(): Buffer {
    const hex = this.configService.get<string>('ENCRYPTION_KEY');
    if (!hex || !KEY_HEX.test(hex)) {
      throw new ServiceUnavailableException(
        'ENCRYPTION_KEY is not configured (64 hex characters)',
      );
    }
    return Buffer.from(hex, 'hex');
  }
}
