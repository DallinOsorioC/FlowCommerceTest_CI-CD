import { ConfigService } from '@nestjs/config';
import { SecretCipher } from '../../../common/crypto/secret-cipher';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '../../../common/exceptions/domain.exceptions';
import type { WhatsAppAccountsRepository } from '../../domain/ports/whatsapp-accounts.repository';
import { WhatsAppCredentialsResolver } from './whatsapp-credentials.resolver';

describe('WhatsAppCredentialsResolver', () => {
  const projectId = '33333333-3333-4333-8333-333333333333';
  const otherProjectId = '44444444-4444-4444-8444-444444444444';
  const env: Record<string, string> = {
    ENCRYPTION_KEY: 'c'.repeat(64),
    WHATSAPP_TOKEN: 'env-token',
    WHATSAPP_PHONE_NUMBER_ID: 'env-phone',
    WHATSAPP_BUSINESS_ACCOUNT_ID: 'env-waba',
    WHATSAPP_PROJECT_ID: projectId,
  };
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const cipher = new SecretCipher(configService);

  const accounts: jest.Mocked<WhatsAppAccountsRepository> = {
    findByProject: jest.fn(),
    findProjectIdByPhoneNumberId: jest.fn(),
    upsert: jest.fn(),
    deleteByProject: jest.fn(),
  };
  const resolver = new WhatsAppCredentialsResolver(
    configService,
    accounts,
    cipher,
  );

  beforeEach(() => jest.resetAllMocks());

  it('uses the decrypted project account when one is saved', async () => {
    accounts.findByProject.mockResolvedValue({
      projectId: otherProjectId,
      phoneNumberId: 'db-phone',
      businessAccountId: 'db-waba',
      tokenEncrypted: cipher.encrypt('db-token'),
      tokenLast4: 'oken',
      updatedAt: new Date(),
    });

    await expect(resolver.resolve(otherProjectId)).resolves.toEqual({
      token: 'db-token',
      phoneNumberId: 'db-phone',
      businessAccountId: 'db-waba',
    });
  });

  it('falls back to the environment for the bound project', async () => {
    accounts.findByProject.mockResolvedValue(null);

    await expect(resolver.resolve(projectId)).resolves.toEqual({
      token: 'env-token',
      phoneNumberId: 'env-phone',
      businessAccountId: 'env-waba',
    });
  });

  it('does not lend the environment number to another project', async () => {
    accounts.findByProject.mockResolvedValue(null);

    await expect(resolver.resolve(otherProjectId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('fails closed when neither source is configured', async () => {
    accounts.findByProject.mockResolvedValue(null);
    const empty = new WhatsAppCredentialsResolver(
      { get: () => undefined } as unknown as ConfigService,
      accounts,
      cipher,
    );

    await expect(empty.resolve(projectId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
