import { Global, Module } from '@nestjs/common';
import { SecretCipher } from './secret-cipher';

// Global: cualquier módulo que guarde secretos recuperables inyecta
// SecretCipher sin importar nada.
@Global()
@Module({
  providers: [SecretCipher],
  exports: [SecretCipher],
})
export class CryptoModule {}
