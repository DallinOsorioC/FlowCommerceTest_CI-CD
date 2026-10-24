import { Test, TestingModule } from '@nestjs/testing';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { QuoteLifecycleEvents } from '../quote-lifecycle.events';
import { LeadStage, Permission, QuoteStatus } from '@flowcommerce/types';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { CLIENTS_REPOSITORY } from '../../../clients/domain/repositories/client.repository';
import { LEADS_REPOSITORY } from '../../../leads/domain/repositories/lead.repository';
import { ProjectEntity } from '../../../projects/domain/entities/project.entity';
import { PROJECT_REPOSITORY } from '../../../projects/domain/repositories/project.repository';
import { PRODUCTS_REPOSITORY } from '../../../products/domain/repositories/product.repository';
import { NotificationPublisher } from '../../../notifications/application/notification-publisher';
import { QuoteEntity } from '../../domain/entities/quote.entity';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
} from '../../domain/repositories/quote.repository';
import { QuoteItemsBuilder } from '../quote-items.builder';
import { QuoteSettingsReader } from '../quote-settings.reader';
import { CreateQuoteUseCase } from './create-quote.use-case';
import { DeleteQuoteUseCase } from './delete-quote.use-case';
import { GetQuoteUseCase } from './get-quote.use-case';
import { ListQuotesUseCase } from './list-quotes.use-case';
import { UpdateQuoteStatusUseCase } from './update-quote-status.use-case';
import { UpdateQuoteUseCase } from './update-quote.use-case';

describe('Quotes use-cases (tenant isolation + lifecycle)', () => {
  let module: TestingModule;
  const authorizationService = { assertCan: jest.fn() };
  const quoteRepository: Record<keyof QuoteRepository, jest.Mock> = {
    findByIdInProject: jest.fn(),
    listByProject: jest.fn(),
    create: jest.fn(),
    updateDraftInProject: jest.fn(),
    deleteDraftInProject: jest.fn(),
    transitionStatusInProject: jest.fn(),
    setPaymentLinkInProject: jest.fn(),
  };
  const leadRepository = { findByIdInProject: jest.fn() };
  const clientRepository = { findByIdInProject: jest.fn() };
  const productRepository = { findManyByIdsInProject: jest.fn() };
  const notifications = { notify: jest.fn() };
  const projectRepository = { findById: jest.fn() };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const leadId = '77777777-7777-4777-8777-777777777777';
  const clientId = '55555555-5555-4555-8555-555555555555';
  const productId = '66666666-6666-4666-8666-666666666666';
  const quoteId = '99999999-9999-4999-8999-999999999999';
  const foreignQuoteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const foreignLeadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const now = new Date('2026-01-01T00:00:00.000Z');

  const item = {
    id: 'item-1',
    quoteId,
    productId,
    description: 'Licencia',
    quantity: 2,
    unitPrice: 500,
    discountPercent: 0,
    lineTotal: 1000,
    position: 1,
  };

  const quote = (status: QuoteStatus, withItems = true): QuoteEntity =>
    new QuoteEntity({
      id: quoteId,
      projectId,
      leadId,
      clientId: null,
      folio: 'COT-000001',
      subtotal: 1000,
      discount: 0,
      adjustment: 0,
      taxPercent: 19,
      tax: 190,
      total: 1190,
      status,
      validUntil: null,
      notes: null,
      terms: null,
      createdByUserId: actorId,
      approvedAt: null,
      sentAt: null,
      acceptedAt: null,
      rejectedAt: null,
      paidAt: null,
      creadoEn: now,
      actualizadoEn: now,
      items: withItems ? [item] : [],
    });

  const product = {
    id: productId,
    projectId,
    name: 'Licencia',
    price: 500,
    maxDiscountPercent: 10,
    active: true,
  };

  const lead = {
    id: leadId,
    projectId,
    name: 'Ana Torres',
    clientId: null,
    stage: LeadStage.NEW,
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        CreateQuoteUseCase,
        ListQuotesUseCase,
        GetQuoteUseCase,
        UpdateQuoteUseCase,
        DeleteQuoteUseCase,
        UpdateQuoteStatusUseCase,
        QuoteItemsBuilder,
        QuoteSettingsReader,
        { provide: PROJECT_REPOSITORY, useValue: projectRepository },
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: QUOTES_REPOSITORY, useValue: quoteRepository },
        { provide: LEADS_REPOSITORY, useValue: leadRepository },
        { provide: CLIENTS_REPOSITORY, useValue: clientRepository },
        { provide: PRODUCTS_REPOSITORY, useValue: productRepository },
        { provide: NotificationPublisher, useValue: notifications },
        { provide: ActivityRecorder, useValue: { record: jest.fn() } },
        QuoteLifecycleEvents,
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
    // Proyecto con los ajustes por defecto (IVA 12 %, prefijo COT, 30 días).
    projectRepository.findById.mockResolvedValue(
      new ProjectEntity('p', 'Proyecto', 'proyecto', null, now, now),
    );
  });

  describe('create()', () => {
    it('applies the commercial adjustment before tax when creating', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      productRepository.findManyByIdsInProject.mockResolvedValue([product]);
      quoteRepository.create.mockResolvedValue(quote(QuoteStatus.DRAFT));

      await module.get(CreateQuoteUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        items: [{ productId, quantity: 2, discountPercent: 10 }],
        adjustment: 50,
      });

      // 1000 bruto - 100 descuento - 50 ajuste = 850; IVA 12% = 102; total 952.
      expect(quoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          totals: {
            subtotal: 1000,
            discount: 100,
            adjustment: 50,
            taxPercent: 12,
            tax: 102,
            total: 952,
          },
        }),
      );
    });

    it('rejects an adjustment on a quote without items with 400', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);

      await expect(
        module.get(CreateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          adjustment: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(quoteRepository.create).not.toHaveBeenCalled();
    });

    it('creates a DRAFT with catalog prices and server-side totals', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      productRepository.findManyByIdsInProject.mockResolvedValue([product]);
      quoteRepository.create.mockResolvedValue(quote(QuoteStatus.DRAFT));

      await module.get(CreateQuoteUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        items: [{ productId, quantity: 2, discountPercent: 10 }],
      });

      // 2 x 500 = 1000 bruto; 10% = 100; base 900; IVA 12% = 108; total 1008.
      expect(quoteRepository.create).toHaveBeenCalledWith({
        projectId,
        leadId,
        clientId: null,
        createdByUserId: actorId,
        folioPrefix: 'COT',
        // Sin validUntil en el body: hoy + 30 días de vigencia por defecto.
        validUntil: expect.any(Date) as Date,
        notes: null,
        terms: null,
        totals: {
          subtotal: 1000,
          discount: 100,
          adjustment: 0,
          taxPercent: 12,
          tax: 108,
          total: 1008,
        },
        items: [
          {
            productId,
            description: 'Licencia',
            quantity: 2,
            unitPrice: 500,
            discountPercent: 10,
            lineTotal: 900,
            position: 1,
          },
        ],
        origin: 'MANUAL',
      });
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.QUOTE_CREATE,
        projectId,
      );
    });

    it('applies the project quote settings: tax, folio prefix, validity and terms', async () => {
      projectRepository.findById.mockResolvedValue(
        new ProjectEntity(
          'p',
          'Proyecto',
          'proyecto',
          null,
          now,
          now,
          undefined,
          {
            taxPercent: 10,
            folioPrefix: 'PRE',
            validityDays: 5,
            defaultTerms: 'Pago contra entrega',
            currency: 'USD',
          },
        ),
      );
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      productRepository.findManyByIdsInProject.mockResolvedValue([product]);
      quoteRepository.create.mockResolvedValue(quote(QuoteStatus.DRAFT));

      const before = Date.now();
      await module.get(CreateQuoteUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        items: [{ productId, quantity: 2 }],
      });

      const created = (
        quoteRepository.create.mock.calls as unknown[][]
      )[0][0] as {
        folioPrefix: string;
        terms: string | null;
        validUntil: Date;
        totals: { tax: number; total: number };
      };
      expect(created.folioPrefix).toBe('PRE');
      expect(created.terms).toBe('Pago contra entrega');
      // 1000 + 10 % de IVA
      expect(created.totals).toMatchObject({ tax: 100, total: 1100 });
      const days = (created.validUntil.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(4.99);
      expect(days).toBeLessThan(5.01);
    });

    it('keeps an explicit null validUntil and explicit terms', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      quoteRepository.create.mockResolvedValue(quote(QuoteStatus.DRAFT));

      await module.get(CreateQuoteUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        validUntil: null,
        terms: null,
      });

      expect(quoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ validUntil: null, terms: null }),
      );
    });

    it('rejects a discount above the product maximum with 400', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      productRepository.findManyByIdsInProject.mockResolvedValue([product]);

      await expect(
        module.get(CreateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          items: [{ productId, quantity: 1, discountPercent: 10.01 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(quoteRepository.create).not.toHaveBeenCalled();
    });

    it('returns 404 for a product that is not in the project', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      productRepository.findManyByIdsInProject.mockResolvedValue([]);

      await expect(
        module.get(CreateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          items: [{ productId, quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 for an inactive product', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      productRepository.findManyByIdsInProject.mockResolvedValue([
        { ...product, active: false },
      ]);

      await expect(
        module.get(CreateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          items: [{ productId, quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a lead from another project and never writes', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module.get(CreateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId: foreignLeadId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(quoteRepository.create).not.toHaveBeenCalled();
      expect(leadRepository.findByIdInProject).toHaveBeenCalledWith(
        foreignLeadId,
        projectId,
      );
    });

    it('refuses a client from another project', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      clientRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module.get(CreateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          clientId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(clientRepository.findByIdInProject).toHaveBeenCalledWith(
        clientId,
        projectId,
      );
      expect(quoteRepository.create).not.toHaveBeenCalled();
    });

    it('defaults the client to the lead client', async () => {
      leadRepository.findByIdInProject.mockResolvedValue({
        ...lead,
        clientId,
      });
      clientRepository.findByIdInProject.mockResolvedValue({
        id: clientId,
        name: 'Acme',
        active: true,
      });
      quoteRepository.create.mockResolvedValue(quote(QuoteStatus.DRAFT));

      await module
        .get(CreateQuoteUseCase)
        .execute({ actorUserId: actorId, projectId, leadId });

      expect(quoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientId }),
      );
    });

    it('translates a composite FK violation into a 404', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      quoteRepository.create.mockRejectedValue(
        Object.assign(new Error('Failed query'), {
          cause: Object.assign(new Error('fk'), {
            code: '23503',
            constraint_name: 'quotes_client_id_project_id_clients_fk',
          }),
        }),
      );

      await expect(
        module
          .get(CreateQuoteUseCase)
          .execute({ actorUserId: actorId, projectId, leadId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not persist anything when the actor lacks QUOTE_CREATE', async () => {
      authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

      await expect(
        module
          .get(CreateQuoteUseCase)
          .execute({ actorUserId: actorId, projectId, leadId }),
      ).rejects.toThrow('forbidden');

      expect(quoteRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('always scopes the query by projectId and forwards the filters', async () => {
      quoteRepository.listByProject.mockResolvedValue({ quotes: [], total: 0 });
      const from = new Date('2026-01-01');

      await module.get(ListQuotesUseCase).execute({
        actorUserId: actorId,
        projectId,
        status: QuoteStatus.APPROVED,
        clientId,
        leadId,
        search: 'COT-0',
        from,
        sortBy: 'total',
        order: 'desc',
        page: 3,
        limit: 5,
      });

      expect(quoteRepository.listByProject).toHaveBeenCalledWith(projectId, {
        status: QuoteStatus.APPROVED,
        clientId,
        leadId,
        search: 'COT-0',
        from,
        to: undefined,
        sortBy: 'total',
        order: 'desc',
        page: 3,
        limit: 5,
      });
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.QUOTE_READ,
        projectId,
      );
    });
  });

  describe('get()', () => {
    it('resolves a quote scoped to the project', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );

      const result = await module
        .get(GetQuoteUseCase)
        .execute({ actorUserId: actorId, projectId, quoteId });

      expect(result.id).toBe(quoteId);
      expect(result.items).toHaveLength(1);
    });

    it('returns 404 for a quote in another project (IDOR)', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module.get(GetQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          quoteId: foreignQuoteId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(quoteRepository.findByIdInProject).toHaveBeenCalledWith(
        foreignQuoteId,
        projectId,
      );
    });
  });

  describe('update()', () => {
    it('replaces the items and recalculates totals on a DRAFT', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );
      productRepository.findManyByIdsInProject.mockResolvedValue([product]);
      quoteRepository.updateDraftInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );

      await module.get(UpdateQuoteUseCase).execute({
        actorUserId: actorId,
        projectId,
        quoteId,
        notes: 'Nota',
        items: [{ productId, quantity: 1 }],
      });

      expect(quoteRepository.updateDraftInProject).toHaveBeenCalledWith(
        quoteId,
        projectId,
        expect.objectContaining({
          notes: 'Nota',
          totals: {
            subtotal: 500,
            discount: 0,
            adjustment: 0,
            taxPercent: 12,
            tax: 60,
            total: 560,
          },
        }),
      );
    });

    it('recalculates the totals from the current items when only the commercial adjustment changes', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );
      quoteRepository.updateDraftInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );

      await module.get(UpdateQuoteUseCase).execute({
        actorUserId: actorId,
        projectId,
        quoteId,
        adjustment: 100,
      });

      // Partida actual: 2 x 500 = 1000; ajuste 100; base 900; IVA 12% = 108.
      expect(productRepository.findManyByIdsInProject).not.toHaveBeenCalled();
      expect(quoteRepository.updateDraftInProject).toHaveBeenCalledWith(
        quoteId,
        projectId,
        expect.objectContaining({
          totals: {
            subtotal: 1000,
            discount: 0,
            adjustment: 100,
            taxPercent: 12,
            tax: 108,
            total: 1008,
          },
        }),
      );
      const [, , changes] = quoteRepository.updateDraftInProject.mock
        .calls[0] as [string, string, { items?: unknown }];
      expect(changes.items).toBeUndefined();
    });

    it('rejects a commercial adjustment larger than the discounted subtotal with 400', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );

      await expect(
        module.get(UpdateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          quoteId,
          adjustment: 1000.01,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(quoteRepository.updateDraftInProject).not.toHaveBeenCalled();
    });

    it('returns 409 when the quote is no longer a DRAFT', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.PENDING_APPROVAL),
      );

      await expect(
        module
          .get(UpdateQuoteUseCase)
          .execute({ actorUserId: actorId, projectId, quoteId, notes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(quoteRepository.updateDraftInProject).not.toHaveBeenCalled();
    });

    it('returns 409 when the status changed between read and write', async () => {
      quoteRepository.findByIdInProject
        .mockResolvedValueOnce(quote(QuoteStatus.DRAFT))
        .mockResolvedValueOnce(quote(QuoteStatus.PENDING_APPROVAL));
      quoteRepository.updateDraftInProject.mockResolvedValue(null);

      await expect(
        module
          .get(UpdateQuoteUseCase)
          .execute({ actorUserId: actorId, projectId, quoteId, notes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 for a quote in another project', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module.get(UpdateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          quoteId: foreignQuoteId,
          notes: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete()', () => {
    it('deletes a DRAFT', async () => {
      quoteRepository.deleteDraftInProject.mockResolvedValue(true);

      await module
        .get(DeleteQuoteUseCase)
        .execute({ actorUserId: actorId, projectId, quoteId });

      expect(quoteRepository.deleteDraftInProject).toHaveBeenCalledWith(
        quoteId,
        projectId,
      );
    });

    it('returns 409 for a quote that is not a DRAFT', async () => {
      quoteRepository.deleteDraftInProject.mockResolvedValue(false);
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.APPROVED),
      );

      await expect(
        module
          .get(DeleteQuoteUseCase)
          .execute({ actorUserId: actorId, projectId, quoteId }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 for a missing or foreign quote', async () => {
      quoteRepository.deleteDraftInProject.mockResolvedValue(false);
      quoteRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module.get(DeleteQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          quoteId: foreignQuoteId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus()', () => {
    const move = (status: QuoteStatus) =>
      module
        .get(UpdateQuoteStatusUseCase)
        .execute({ actorUserId: actorId, projectId, quoteId, status });

    beforeEach(() => {
      // Catálogo actual igual al de las partidas (P1 no se dispara).
      productRepository.findManyByIdsInProject.mockResolvedValue([product]);
    });

    it('notifies the approvers when approval is requested (not the actor)', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );
      quoteRepository.transitionStatusInProject.mockResolvedValue(
        quote(QuoteStatus.PENDING_APPROVAL),
      );

      await move(QuoteStatus.PENDING_APPROVAL);

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'QUOTE_PENDING_APPROVAL',
          recipients: { roles: ['OWNER', 'ADMIN'] },
          excludeUserId: actorId,
          entity: { type: 'QUOTE', id: quoteId },
        }),
      );
    });

    it('allows DRAFT -> PENDING_APPROVAL with only QUOTE_CREATE, atomically', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );
      quoteRepository.transitionStatusInProject.mockResolvedValue(
        quote(QuoteStatus.PENDING_APPROVAL),
      );

      const result = await move(QuoteStatus.PENDING_APPROVAL);

      expect(result.status).toBe(QuoteStatus.PENDING_APPROVAL);
      expect(authorizationService.assertCan).toHaveBeenCalledTimes(1);
      expect(quoteRepository.transitionStatusInProject).toHaveBeenCalledWith(
        quoteId,
        projectId,
        {
          from: QuoteStatus.DRAFT,
          to: QuoteStatus.PENDING_APPROVAL,
          at: expect.any(Date) as Date,
        },
      );
    });

    it.each([
      [QuoteStatus.PENDING_APPROVAL, QuoteStatus.APPROVED, true],
      [QuoteStatus.ACCEPTED, QuoteStatus.PAID, true],
      [QuoteStatus.APPROVED, QuoteStatus.SENT, false],
      [QuoteStatus.SENT, QuoteStatus.ACCEPTED, false],
      [QuoteStatus.SENT, QuoteStatus.REJECTED, false],
      [QuoteStatus.PENDING_APPROVAL, QuoteStatus.DRAFT, false],
    ])('%s -> %s (needs QUOTE_APPROVE: %s)', async (from, to, needsApprove) => {
      quoteRepository.findByIdInProject.mockResolvedValue(quote(from));
      quoteRepository.transitionStatusInProject.mockResolvedValue(quote(to));

      await move(to);

      const calls = authorizationService.assertCan.mock.calls.map(
        (call: unknown[]) => call[1],
      );
      expect(calls.includes(Permission.QUOTE_APPROVE)).toBe(needsApprove);
    });

    it('refuses to approve without QUOTE_APPROVE and writes nothing', async () => {
      authorizationService.assertCan.mockImplementation(
        (_user: string, permission: Permission) =>
          permission === Permission.QUOTE_APPROVE
            ? Promise.reject(new Error('forbidden'))
            : Promise.resolve(),
      );

      await expect(move(QuoteStatus.APPROVED)).rejects.toThrow('forbidden');
      expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    });

    it('rejects a DRAFT -> PAID jump that would skip approval', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );

      await expect(move(QuoteStatus.PAID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    });

    it.each([QuoteStatus.PAID, QuoteStatus.REJECTED])(
      'treats %s as terminal',
      async (terminal) => {
        quoteRepository.findByIdInProject.mockResolvedValue(quote(terminal));

        await expect(move(QuoteStatus.DRAFT)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(
          quoteRepository.transitionStatusInProject,
        ).not.toHaveBeenCalled();
      },
    );

    it('rejects a no-op transition', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );

      await expect(move(QuoteStatus.DRAFT)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to request approval for a quote without items', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT, false),
      );

      await expect(move(QuoteStatus.PENDING_APPROVAL)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    });

    it('returns 409 when a concurrent request already moved the quote', async () => {
      quoteRepository.findByIdInProject
        .mockResolvedValueOnce(quote(QuoteStatus.PENDING_APPROVAL))
        .mockResolvedValueOnce(quote(QuoteStatus.APPROVED));
      // El UPDATE atómico no encuentra fila: el estado ya no es el leído.
      quoteRepository.transitionStatusInProject.mockResolvedValue(null);

      await expect(move(QuoteStatus.APPROVED)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('returns 404 when the quote vanished before the write', async () => {
      quoteRepository.findByIdInProject
        .mockResolvedValueOnce(quote(QuoteStatus.DRAFT))
        .mockResolvedValueOnce(null);
      quoteRepository.transitionStatusInProject.mockResolvedValue(null);

      await expect(move(QuoteStatus.PENDING_APPROVAL)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns 404 and writes nothing for a quote in another project', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module.get(UpdateQuoteStatusUseCase).execute({
          actorUserId: actorId,
          projectId,
          quoteId: foreignQuoteId,
          status: QuoteStatus.PENDING_APPROVAL,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    });

    it('does not write anything when the actor lacks QUOTE_CREATE', async () => {
      authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

      await expect(move(QuoteStatus.PENDING_APPROVAL)).rejects.toThrow(
        'forbidden',
      );
      expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    });
  });

  describe('validity, catalog and client rules', () => {
    const day = 86_400_000;
    const move = (status: QuoteStatus) =>
      module
        .get(UpdateQuoteStatusUseCase)
        .execute({ actorUserId: actorId, projectId, quoteId, status });
    const withValidUntil = (status: QuoteStatus, validUntil: Date | null) =>
      new QuoteEntity({ ...quote(status).toDetail(), validUntil });

    it('B8: rejects creating a quote whose validUntil already passed', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);

      await expect(
        module.get(CreateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          validUntil: new Date(Date.now() - day),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(quoteRepository.create).not.toHaveBeenCalled();
    });

    it('B8: accepts validUntil null (no expiration)', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      quoteRepository.create.mockResolvedValue(quote(QuoteStatus.DRAFT));

      await module.get(CreateQuoteUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        validUntil: null,
      });

      expect(quoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ validUntil: null }),
      );
    });

    it('B8: rejects editing a draft with a past validUntil', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        quote(QuoteStatus.DRAFT),
      );

      await expect(
        module.get(UpdateQuoteUseCase).execute({
          actorUserId: actorId,
          projectId,
          quoteId,
          validUntil: new Date(Date.now() - day),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(quoteRepository.updateDraftInProject).not.toHaveBeenCalled();
    });

    it('B8: refuses to accept an expired quote and keeps its status', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        withValidUntil(QuoteStatus.SENT, new Date(Date.now() - day)),
      );

      await expect(move(QuoteStatus.ACCEPTED)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    });

    it('B8: accepts a quote that is still valid', async () => {
      quoteRepository.findByIdInProject.mockResolvedValue(
        withValidUntil(QuoteStatus.SENT, new Date(Date.now() + day)),
      );
      quoteRepository.transitionStatusInProject.mockResolvedValue(
        quote(QuoteStatus.ACCEPTED),
      );

      await expect(move(QuoteStatus.ACCEPTED)).resolves.toBeDefined();
    });

    it.each([
      ['the product was deactivated', { active: false }],
      [
        'the maximum discount dropped below the item',
        { maxDiscountPercent: 0 },
      ],
      ['the price changed', { price: 650 }],
    ])('P1: refuses to request approval when %s', async (_label, change) => {
      const draft = new QuoteEntity({
        ...quote(QuoteStatus.DRAFT).toDetail(),
        items: [{ ...item, discountPercent: 5 }],
      });
      quoteRepository.findByIdInProject.mockResolvedValue(draft);
      productRepository.findManyByIdsInProject.mockResolvedValue([
        { ...product, ...change },
      ]);

      await expect(move(QuoteStatus.PENDING_APPROVAL)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    });

    it('C4: refuses to quote for an inactive client', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(lead);
      clientRepository.findByIdInProject.mockResolvedValue({
        id: clientId,
        name: 'Acme',
        active: false,
      });

      await expect(
        module
          .get(CreateQuoteUseCase)
          .execute({ actorUserId: actorId, projectId, leadId, clientId }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(quoteRepository.create).not.toHaveBeenCalled();
    });
  });
});
