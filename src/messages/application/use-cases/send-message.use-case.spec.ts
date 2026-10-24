import { Test, TestingModule } from '@nestjs/testing';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { MessageDirection, Permission } from '@flowcommerce/types';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';
import {
  WHATSAPP_GATEWAY,
  type WhatsAppGateway,
} from '../../domain/ports/whatsapp.gateway';
import { SendMessageUseCase } from './send-message.use-case';

describe('SendMessageUseCase', () => {
  let module: TestingModule;
  const authorizationService = {
    assertCan: jest.fn(),
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
  const whatsappGateway: Record<keyof WhatsAppGateway, jest.Mock> = {
    send: jest.fn(),
    sendTemplate: jest.fn(),
    sendMedia: jest.fn(),
    listTemplates: jest.fn(),
    createTemplate: jest.fn(),
    verifyCredentials: jest.fn(),
    deleteTemplate: jest.fn(),
    downloadMedia: jest.fn(),
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

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const leadId = '77777777-7777-4777-8777-777777777777';
  const foreignLeadId = '88888888-8888-4888-8888-888888888888';
  const now = new Date('2026-01-01T00:00:00.000Z');
  const wamid = 'wamid.test-0001';

  const lead = {
    id: leadId,
    projectId,
    name: 'Ana Torres',
    email: 'ana@example.com',
    phone: '+52 55 1234 5678',
    stage: 'NEW' as const,
    score: 0,
    creadoEn: now,
    actualizadoEn: now,
  };

  const persisted = {
    id: '99999999-9999-4999-8999-999999999999',
    projectId,
    leadId,
    whatsappMessageId: wamid,
    direction: MessageDirection.OUTBOUND,
    content: 'Hola, le comparto la propuesta.',
    status: 'SENT',
    creadoEn: now,
  };

  const sendInput = {
    actorUserId: actorId,
    projectId,
    leadId,
    content: 'Hola, le comparto la propuesta.',
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        SendMessageUseCase,
        {
          provide: AuthorizationService,
          useValue: authorizationService,
        },
        {
          provide: LEADS_REPOSITORY,
          useValue: leadRepository,
        },
        {
          provide: WHATSAPP_GATEWAY,
          useValue: whatsappGateway,
        },
        {
          provide: MESSAGES_REPOSITORY,
          useValue: messagesRepository,
        },
        { provide: ActivityRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends and persists an OUTBOUND message after checking the permission', async () => {
    authorizationService.assertCan.mockResolvedValue(undefined);
    leadRepository.findByIdInProject.mockResolvedValue(lead);
    whatsappGateway.send.mockResolvedValue({
      whatsappMessageId: wamid,
      status: 'SENT',
    });
    messagesRepository.create.mockResolvedValue(persisted);

    const result = await module.get(SendMessageUseCase).execute(sendInput);

    expect(result.whatsappMessageId).toBe(wamid);
    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorId,
      Permission.WHATSAPP_SEND_MESSAGE,
      projectId,
    );
    expect(whatsappGateway.send).toHaveBeenCalledWith({
      projectId,
      leadId,
      phone: '+52 55 1234 5678',
      content: 'Hola, le comparto la propuesta.',
    });
    expect(messagesRepository.create).toHaveBeenCalledWith({
      projectId,
      leadId,
      whatsappMessageId: wamid,
      direction: MessageDirection.OUTBOUND,
      content: 'Hola, le comparto la propuesta.',
      status: 'SENT',
    });
    // El envío cuenta como último contacto con el lead.
    expect(leadRepository.touchLastContactInProject).toHaveBeenCalledWith(
      leadId,
      projectId,
      persisted.creadoEn,
    );
  });

  // El orden importa: el id de WhatsApp es NOT NULL y lo genera el servidor,
  // así que no se puede persistir antes de llamar al gateway.
  it('does not persist anything when the gateway rejects the send', async () => {
    authorizationService.assertCan.mockResolvedValue(undefined);
    leadRepository.findByIdInProject.mockResolvedValue(lead);
    whatsappGateway.send.mockRejectedValue(new Error('whatsapp down'));

    await expect(
      module.get(SendMessageUseCase).execute(sendInput),
    ).rejects.toThrow('whatsapp down');

    expect(messagesRepository.create).not.toHaveBeenCalled();
  });

  it('does not call the gateway when the actor lacks WHATSAPP_SEND_MESSAGE', async () => {
    authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

    await expect(
      module.get(SendMessageUseCase).execute(sendInput),
    ).rejects.toThrow('forbidden');

    expect(whatsappGateway.send).not.toHaveBeenCalled();
    expect(messagesRepository.create).not.toHaveBeenCalled();
  });

  it('never sends to a lead that belongs to another project (IDOR)', async () => {
    authorizationService.assertCan.mockResolvedValue(undefined);
    leadRepository.findByIdInProject.mockResolvedValue(null);

    await expect(
      module.get(SendMessageUseCase).execute({
        ...sendInput,
        leadId: foreignLeadId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(leadRepository.findByIdInProject).toHaveBeenCalledWith(
      foreignLeadId,
      projectId,
    );
    expect(whatsappGateway.send).not.toHaveBeenCalled();
    expect(messagesRepository.create).not.toHaveBeenCalled();
  });

  it('does not record a delivery the lead cannot receive', async () => {
    authorizationService.assertCan.mockResolvedValue(undefined);
    leadRepository.findByIdInProject.mockResolvedValue({
      ...lead,
      phone: null,
    });

    await expect(
      module.get(SendMessageUseCase).execute(sendInput),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(whatsappGateway.send).not.toHaveBeenCalled();
    expect(messagesRepository.create).not.toHaveBeenCalled();
  });

  it('always scopes the lead lookup by projectId, even with no tenant guess', async () => {
    authorizationService.assertCan.mockResolvedValue(undefined);
    leadRepository.findByIdInProject.mockResolvedValue(lead);
    whatsappGateway.send.mockResolvedValue({
      whatsappMessageId: wamid,
      status: 'SENT',
    });
    messagesRepository.create.mockResolvedValue(persisted);

    await module.get(SendMessageUseCase).execute(sendInput);

    // Si alguien reintrodujera un findById(id) global, esta aserción lo detecta.
    expect(leadRepository).not.toHaveProperty('findById');
    expect(leadRepository.findByIdInProject).toHaveBeenCalledWith(
      leadId,
      projectId,
    );
  });
});
