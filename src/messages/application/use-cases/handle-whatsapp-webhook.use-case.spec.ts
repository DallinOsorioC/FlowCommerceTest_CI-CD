import { Test, TestingModule } from '@nestjs/testing';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { AttachmentStore } from '../../../files/application/attachment-store';
import { WHATSAPP_GATEWAY } from '../../domain/ports/whatsapp.gateway';
import { ConfigService } from '@nestjs/config';
import { MessageDirection } from '@flowcommerce/types';
import { ForbiddenException } from '../../../common/exceptions/domain.exceptions';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';
import { WHATSAPP_ACCOUNTS_REPOSITORY } from '../../domain/ports/whatsapp-accounts.repository';
import { signWhatsAppPayload } from '../../infrastructure/whatsapp/whatsapp-webhook.signature';
import { HandleWhatsAppWebhookUseCase } from './handle-whatsapp-webhook.use-case';
import { NotificationPublisher } from '../../../notifications/application/notification-publisher';

describe('HandleWhatsAppWebhookUseCase', () => {
  let module: TestingModule;
  const projectId = '33333333-3333-4333-8333-333333333333';
  const appSecret = 'webhook-secret';
  const config: Record<string, string> = {
    WHATSAPP_APP_SECRET: appSecret,
    WHATSAPP_VERIFY_TOKEN: 'verify-me',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_PROJECT_ID: projectId,
  };

  const leadRepository: Record<keyof LeadRepository, jest.Mock> = {
    findByIdInProject: jest.fn(),
    findByPhoneDigitsInProject: jest.fn(),
    listByProject: jest.fn(),
    findOrCreateByPhoneInProject: jest.fn(),
    touchLastContactInProject: jest.fn(),
    create: jest.fn(),
    updateInProject: jest.fn(),
    linkClientInProject: jest.fn(),
    deleteInProject: jest.fn(),
  };
  const messagesRepository: Record<keyof MessagesRepository, jest.Mock> = {
    create: jest.fn(),
    createIfNotExists: jest.fn(),
    findByWhatsappMessageIdInProject: jest.fn(),
    updateStatusInProject: jest.fn(),
    listByLeadInProject: jest.fn(),
    findLastInboundAtInProject: jest.fn(),
    markInboundAsReadInProject: jest.fn(),
    listConversationsInProject: jest.fn(),
    countUnreadInProject: jest.fn(),
    setAttachmentIfEmptyInProject: jest.fn(),
  };

  const accounts = { findProjectIdByPhoneNumberId: jest.fn() };
  const notifications = { notify: jest.fn() };
  const whatsappGateway = { downloadMedia: jest.fn() };
  const attachmentStore = { store: jest.fn(), discard: jest.fn() };

  const inboundPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '123456789' },
              messages: [
                {
                  from: '525512345678',
                  id: 'wamid.in-1',
                  type: 'text',
                  text: { body: 'Quiero la cotización' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        HandleWhatsAppWebhookUseCase,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
        { provide: LEADS_REPOSITORY, useValue: leadRepository },
        { provide: MESSAGES_REPOSITORY, useValue: messagesRepository },
        { provide: NotificationPublisher, useValue: notifications },
        { provide: ActivityRecorder, useValue: { record: jest.fn() } },
        { provide: WHATSAPP_GATEWAY, useValue: whatsappGateway },
        { provide: WHATSAPP_ACCOUNTS_REPOSITORY, useValue: accounts },
        { provide: AttachmentStore, useValue: attachmentStore },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the hub challenge when the verify token matches', () => {
    expect(
      module
        .get(HandleWhatsAppWebhookUseCase)
        .verifyChallenge('subscribe', 'verify-me', 'challenge-123'),
    ).toBe('challenge-123');
  });

  it('rejects a verify request with the wrong token', () => {
    expect(() =>
      module
        .get(HandleWhatsAppWebhookUseCase)
        .verifyChallenge('subscribe', 'nope', 'challenge-123'),
    ).toThrow(ForbiddenException);
  });

  it('persists an inbound text message for the lead in the bound project', async () => {
    const rawBody = Buffer.from(JSON.stringify(inboundPayload));
    leadRepository.findOrCreateByPhoneInProject.mockResolvedValue({
      lead: { id: '77777777-7777-4777-8777-777777777777' },
      created: false,
    });
    const receivedAt = new Date('2026-10-15T10:00:00.000Z');
    messagesRepository.createIfNotExists.mockResolvedValue({
      creadoEn: receivedAt,
    });

    await module.get(HandleWhatsAppWebhookUseCase).execute({
      rawBody,
      signatureHeader: signWhatsAppPayload(rawBody, appSecret),
      payload: inboundPayload,
    });

    expect(leadRepository.findOrCreateByPhoneInProject).toHaveBeenCalledWith(
      '525512345678',
      projectId,
      expect.objectContaining({ phone: '+525512345678' }),
    );
    expect(messagesRepository.createIfNotExists).toHaveBeenCalledWith({
      projectId,
      leadId: '77777777-7777-4777-8777-777777777777',
      whatsappMessageId: 'wamid.in-1',
      direction: MessageDirection.INBOUND,
      type: 'TEXT',
      content: 'Quiero la cotización',
      status: 'RECEIVED',
    });
    expect(leadRepository.touchLastContactInProject).toHaveBeenCalledWith(
      '77777777-7777-4777-8777-777777777777',
      projectId,
      receivedAt,
    );
  });

  it('creates a WHATSAPP lead named after the contact profile when the number is unknown', async () => {
    const payload = {
      ...inboundPayload,
      entry: [
        {
          changes: [
            {
              value: {
                ...inboundPayload.entry[0].changes[0].value,
                contacts: [
                  { wa_id: '525512345678', profile: { name: 'Ana Pérez' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    leadRepository.findOrCreateByPhoneInProject.mockResolvedValue({
      lead: { id: '99999999-9999-4999-8999-999999999999' },
      created: true,
    });
    messagesRepository.createIfNotExists.mockResolvedValue({
      creadoEn: new Date(),
    });

    await module.get(HandleWhatsAppWebhookUseCase).execute({
      rawBody,
      signatureHeader: signWhatsAppPayload(rawBody, appSecret),
      payload,
    });

    expect(leadRepository.findOrCreateByPhoneInProject).toHaveBeenCalledWith(
      '525512345678',
      projectId,
      expect.objectContaining({
        projectId,
        name: 'Ana Pérez',
        phone: '+525512345678',
        stage: 'NEW',
        source: 'WHATSAPP',
      }),
    );
    expect(messagesRepository.createIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: '99999999-9999-4999-8999-999999999999',
      }),
    );
  });

  it('does not touch the lead when the message was a duplicate of another tenant', async () => {
    const rawBody = Buffer.from(JSON.stringify(inboundPayload));
    leadRepository.findOrCreateByPhoneInProject.mockResolvedValue({
      lead: { id: '77777777-7777-4777-8777-777777777777' },
      created: false,
    });
    messagesRepository.createIfNotExists.mockResolvedValue(null);

    await module.get(HandleWhatsAppWebhookUseCase).execute({
      rawBody,
      signatureHeader: signWhatsAppPayload(rawBody, appSecret),
      payload: inboundPayload,
    });

    expect(leadRepository.touchLastContactInProject).not.toHaveBeenCalled();
  });

  it('rejects unsigned payloads', async () => {
    const rawBody = Buffer.from(JSON.stringify(inboundPayload));

    await expect(
      module.get(HandleWhatsAppWebhookUseCase).execute({
        rawBody,
        signatureHeader: 'sha256=deadbeef',
        payload: inboundPayload,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(messagesRepository.createIfNotExists).not.toHaveBeenCalled();
  });

  it('does not persist events for another phone_number_id', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '000000' },
                messages: inboundPayload.entry[0].changes[0].value.messages,
              },
            },
          ],
        },
      ],
    };
    const rawBody = Buffer.from(JSON.stringify(payload));

    await module.get(HandleWhatsAppWebhookUseCase).execute({
      rawBody,
      signatureHeader: signWhatsAppPayload(rawBody, appSecret),
      payload,
    });

    expect(leadRepository.findOrCreateByPhoneInProject).not.toHaveBeenCalled();
    expect(messagesRepository.createIfNotExists).not.toHaveBeenCalled();
  });

  it('does not persist events that carry no phone_number_id (fail-closed)', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: inboundPayload.entry[0].changes[0].value.messages,
                statuses: [{ id: 'wamid.out-1', status: 'read' }],
              },
            },
          ],
        },
      ],
    };
    const rawBody = Buffer.from(JSON.stringify(payload));

    await module.get(HandleWhatsAppWebhookUseCase).execute({
      rawBody,
      signatureHeader: signWhatsAppPayload(rawBody, appSecret),
      payload,
    });

    expect(leadRepository.findOrCreateByPhoneInProject).not.toHaveBeenCalled();
    expect(messagesRepository.createIfNotExists).not.toHaveBeenCalled();
    expect(messagesRepository.updateStatusInProject).not.toHaveBeenCalled();
  });

  it('persists nothing when WHATSAPP_PHONE_NUMBER_ID is not configured', async () => {
    const saved = config.WHATSAPP_PHONE_NUMBER_ID;
    delete config.WHATSAPP_PHONE_NUMBER_ID;
    try {
      const rawBody = Buffer.from(JSON.stringify(inboundPayload));

      await module.get(HandleWhatsAppWebhookUseCase).execute({
        rawBody,
        signatureHeader: signWhatsAppPayload(rawBody, appSecret),
        payload: inboundPayload,
      });
    } finally {
      config.WHATSAPP_PHONE_NUMBER_ID = saved;
    }

    expect(leadRepository.findOrCreateByPhoneInProject).not.toHaveBeenCalled();
    expect(messagesRepository.createIfNotExists).not.toHaveBeenCalled();
  });

  it('updates delivery status only inside the bound project', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '123456789' },
                statuses: [{ id: 'wamid.out-1', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    messagesRepository.updateStatusInProject.mockResolvedValue({});

    await module.get(HandleWhatsAppWebhookUseCase).execute({
      rawBody,
      signatureHeader: signWhatsAppPayload(rawBody, appSecret),
      payload,
    });

    expect(messagesRepository.updateStatusInProject).toHaveBeenCalledWith(
      'wamid.out-1',
      projectId,
      'DELIVERED',
      null,
    );
  });

  it('stores why WhatsApp could not deliver a message', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '123456789' },
                statuses: [
                  {
                    id: 'wamid.out-2',
                    status: 'failed',
                    errors: [{ code: 131047, title: 'Re-engagement message' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    messagesRepository.updateStatusInProject.mockResolvedValue({});

    await module.get(HandleWhatsAppWebhookUseCase).execute({
      rawBody,
      signatureHeader: signWhatsAppPayload(rawBody, appSecret),
      payload,
    });

    expect(messagesRepository.updateStatusInProject).toHaveBeenCalledWith(
      'wamid.out-2',
      projectId,
      'FAILED',
      '131047: Re-engagement message',
    );
  });

  describe('project resolution by phone_number_id', () => {
    const otherProjectId = '44444444-4444-4444-8444-444444444444';
    const payloadFor = (phoneNumberId?: string) => ({
      ...inboundPayload,
      entry: [
        {
          changes: [
            {
              value: {
                ...inboundPayload.entry[0].changes[0].value,
                metadata: phoneNumberId
                  ? { phone_number_id: phoneNumberId }
                  : undefined,
              },
            },
          ],
        },
      ],
    });
    const post = (payload: object) => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      return module.get(HandleWhatsAppWebhookUseCase).execute({
        rawBody,
        signatureHeader: signWhatsAppPayload(rawBody, appSecret),
        payload,
      });
    };

    beforeEach(() => {
      leadRepository.findOrCreateByPhoneInProject.mockResolvedValue({
        lead: { id: '77777777-7777-4777-8777-777777777777' },
        created: false,
      });
      messagesRepository.createIfNotExists.mockResolvedValue({
        creadoEn: new Date(),
      });
    });

    it('routes a number saved by another project to THAT project', async () => {
      accounts.findProjectIdByPhoneNumberId.mockResolvedValue(otherProjectId);

      await post(payloadFor('555000111'));

      expect(accounts.findProjectIdByPhoneNumberId).toHaveBeenCalledWith(
        '555000111',
      );
      expect(messagesRepository.createIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: otherProjectId }),
      );
    });

    it('keeps the environment number bound to WHATSAPP_PROJECT_ID, never asking the database', async () => {
      accounts.findProjectIdByPhoneNumberId.mockResolvedValue(otherProjectId);

      await post(payloadFor('123456789'));

      expect(accounts.findProjectIdByPhoneNumberId).not.toHaveBeenCalled();
      expect(messagesRepository.createIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({ projectId }),
      );
    });

    it('drops events for a number no project owns (fail-closed)', async () => {
      accounts.findProjectIdByPhoneNumberId.mockResolvedValue(null);

      await post(payloadFor('999999999'));

      expect(messagesRepository.createIfNotExists).not.toHaveBeenCalled();
      expect(
        leadRepository.findOrCreateByPhoneInProject,
      ).not.toHaveBeenCalled();
    });

    it('drops events without a phone_number_id', async () => {
      await post(payloadFor(undefined));

      expect(accounts.findProjectIdByPhoneNumberId).not.toHaveBeenCalled();
      expect(messagesRepository.createIfNotExists).not.toHaveBeenCalled();
    });
  });

  describe('Meta retries after a partial failure', () => {
    const leadId = '77777777-7777-4777-8777-777777777777';
    const post = () => {
      const rawBody = Buffer.from(JSON.stringify(inboundPayload));
      return module.get(HandleWhatsAppWebhookUseCase).execute({
        rawBody,
        signatureHeader: signWhatsAppPayload(rawBody, appSecret),
        payload: inboundPayload,
      });
    };

    beforeEach(() => {
      leadRepository.findOrCreateByPhoneInProject.mockResolvedValue({
        lead: { id: leadId, name: 'Ana', assignedUserId: null },
        created: false,
      });
    });

    it('repeats the idempotent steps for a message that was already stored', async () => {
      const stored = {
        id: 'm1',
        projectId,
        leadId,
        direction: 'INBOUND',
        type: 'TEXT',
        content: 'Quiero la cotización',
        creadoEn: new Date('2026-10-15T10:00:00.000Z'),
        attachmentId: null,
      };
      messagesRepository.createIfNotExists.mockResolvedValue(null);
      messagesRepository.findByWhatsappMessageIdInProject.mockResolvedValue(
        stored,
      );

      await post();

      expect(leadRepository.touchLastContactInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
        stored.creadoEn,
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ dedupeKey: 'message:wamid.in-1' }),
      );
    });

    it('does nothing for a duplicate that belongs to no project of this tenant', async () => {
      messagesRepository.createIfNotExists.mockResolvedValue(null);
      messagesRepository.findByWhatsappMessageIdInProject.mockResolvedValue(
        null,
      );

      await post();

      expect(leadRepository.touchLastContactInProject).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('answers with an error (so Meta retries) but still processes the other messages', async () => {
      const payload = {
        ...inboundPayload,
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '123456789' },
                  messages: [
                    {
                      from: '525512345678',
                      id: 'wamid.boom',
                      type: 'text',
                      text: { body: 'primero' },
                    },
                    {
                      from: '525512345678',
                      id: 'wamid.fine',
                      type: 'text',
                      text: { body: 'segundo' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      messagesRepository.createIfNotExists
        .mockRejectedValueOnce(new Error('db blip'))
        .mockResolvedValueOnce({ id: 'm2', creadoEn: new Date() });

      await expect(
        module.get(HandleWhatsAppWebhookUseCase).execute({
          rawBody,
          signatureHeader: signWhatsAppPayload(rawBody, appSecret),
          payload,
        }),
      ).rejects.toThrow('db blip');

      expect(messagesRepository.createIfNotExists).toHaveBeenCalledTimes(2);
    });
  });
});
