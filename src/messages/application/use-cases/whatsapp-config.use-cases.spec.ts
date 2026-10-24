/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import { ConfigService } from '@nestjs/config';
import { Permission } from '@flowcommerce/types';
import type { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { SecretCipher } from '../../../common/crypto/secret-cipher';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import type { WhatsAppAccountsRepository } from '../../domain/ports/whatsapp-accounts.repository';
import type { WhatsAppGateway } from '../../domain/ports/whatsapp.gateway';
import {
  DeleteWhatsAppConfigUseCase,
  GetWhatsAppConfigUseCase,
  SaveWhatsAppConfigUseCase,
} from './whatsapp-config.use-cases';
import { ManageWhatsAppTemplatesUseCase } from './whatsapp-templates.use-cases';

describe('WhatsApp config and template management', () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';

  const authorizationService = {
    assertCan: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthorizationService>;
  const env: Record<string, string> = {
    ENCRYPTION_KEY: 'd'.repeat(64),
    WHATSAPP_PHONE_NUMBER_ID: 'env-phone',
    WHATSAPP_PROJECT_ID: 'env-project',
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
  const gateway = {
    verifyCredentials: jest.fn().mockResolvedValue(undefined),
    listTemplates: jest.fn(),
    createTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
  } as unknown as jest.Mocked<WhatsAppGateway>;

  beforeEach(() => jest.clearAllMocks());

  it('stores the token encrypted and never echoes it back', async () => {
    accounts.upsert.mockImplementation((input) =>
      Promise.resolve({
        projectId: input.projectId,
        phoneNumberId: input.phoneNumberId,
        businessAccountId: input.businessAccountId,
        tokenEncrypted: input.tokenEncrypted,
        tokenLast4: input.tokenLast4,
        updatedAt: new Date(),
      }),
    );
    const useCase = new SaveWhatsAppConfigUseCase(
      authorizationService,
      cipher,
      configService,
      gateway,
      accounts,
    );

    const view = await useCase.execute({
      actorUserId,
      projectId,
      phoneNumberId: ' 123456 ',
      businessAccountId: null,
      token: 'EAAGsecret1234',
    });

    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorUserId,
      Permission.PROJECT_UPDATE,
      projectId,
    );
    const saved = accounts.upsert.mock.calls[0][0];
    expect(saved.tokenEncrypted).not.toContain('EAAGsecret1234');
    expect(cipher.decrypt(saved.tokenEncrypted)).toBe('EAAGsecret1234');
    expect(saved.phoneNumberId).toBe('123456');
    expect(view.tokenLast4).toBe('1234');
    expect(JSON.stringify(view)).not.toContain('EAAGsecret');
  });

  describe('credential checks on save', () => {
    const save = (overrides: Partial<{ phoneNumberId: string }> = {}) =>
      new SaveWhatsAppConfigUseCase(
        authorizationService,
        cipher,
        configService,
        gateway,
        accounts,
      ).execute({
        actorUserId,
        projectId,
        phoneNumberId: '555000111',
        businessAccountId: null,
        token: 'EAAG-token-1234',
        ...overrides,
      });

    it('asks Meta whether the token reaches that number before saving', async () => {
      accounts.upsert.mockResolvedValue({
        projectId,
        phoneNumberId: '555000111',
        businessAccountId: null,
        tokenEncrypted: 'x',
        tokenLast4: '1234',
        updatedAt: new Date(),
      });

      await save();

      expect(gateway.verifyCredentials).toHaveBeenCalledWith({
        token: 'EAAG-token-1234',
        phoneNumberId: '555000111',
      });
    });

    it('does NOT save when Meta rejects the token (400)', async () => {
      gateway.verifyCredentials.mockRejectedValueOnce(
        new ConflictException('Invalid OAuth access token'),
      );

      await expect(save()).rejects.toBeInstanceOf(BadRequestException);
      expect(accounts.upsert).not.toHaveBeenCalled();
    });

    it('refuses the environment number for any other project (409)', async () => {
      await expect(save({ phoneNumberId: 'env-phone' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(gateway.verifyCredentials).not.toHaveBeenCalled();
      expect(accounts.upsert).not.toHaveBeenCalled();
    });
  });

  it('reports a project without account as not connected', async () => {
    accounts.findByProject.mockResolvedValue(null);
    const view = await new GetWhatsAppConfigUseCase(
      authorizationService,
      accounts,
    ).execute({ actorUserId, projectId });

    expect(view).toMatchObject({ connected: false, source: 'none' });
  });

  it('404s when disconnecting a project that has no account', async () => {
    accounts.deleteByProject.mockResolvedValue(false);

    await expect(
      new DeleteWhatsAppConfigUseCase(authorizationService, accounts).execute({
        actorUserId,
        projectId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('templates', () => {
    const useCase = new ManageWhatsAppTemplatesUseCase(
      authorizationService,
      gateway,
    );
    const template = {
      name: 'seguimiento',
      language: 'es',
      category: 'UTILITY' as const,
      bodyText: 'Hola {{1}}, su cotización {{2}}',
      bodyExamples: ['Ana', 'COT-1'],
    };

    it('submits a template to Meta when examples cover the variables', async () => {
      gateway.createTemplate.mockResolvedValue({ id: 't1', status: 'PENDING' });

      await expect(
        useCase.create({ actorUserId, projectId, template }),
      ).resolves.toEqual({ id: 't1', status: 'PENDING' });
      expect(gateway.createTemplate).toHaveBeenCalledWith(projectId, template);
    });

    it('rejects a body with variables lacking examples before calling Meta', async () => {
      await expect(
        useCase.create({
          actorUserId,
          projectId,
          template: { ...template, bodyExamples: ['Ana'] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.createTemplate).not.toHaveBeenCalled();
    });

    it('lists every status, not only approved', async () => {
      gateway.listTemplates.mockResolvedValue([]);
      await useCase.list({ actorUserId, projectId });
      expect(gateway.listTemplates).toHaveBeenCalledWith(projectId, {
        allStatuses: true,
      });
    });
  });
});
