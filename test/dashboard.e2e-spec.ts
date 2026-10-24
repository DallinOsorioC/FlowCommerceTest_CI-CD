import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { LeadStage, QuoteStatus } from '@flowcommerce/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import type { Database } from '../src/db';
import { DATABASE_CLIENT } from '../src/db/database.constants';
import { leads, memberships, projects, quotes, users } from '../src/db/schema';
import { SESSION_MANAGER } from '../src/auth/application/ports/session-manager';

// El Dashboard se verifica con datos sembrados directamente en DB (fechas y
// montos fijos), porque la agregación vive en el repositorio, no en el HTTP.
// Fechas a mediodía UTC para que el troncado a 'YYYY-MM' no dependa del
// timezone de la sesión de Postgres.
const created = (month: string, day: string) =>
  new Date(`2026-${month}-${day}T12:00:00.000Z`);

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;

  const now = new Date();
  const future = new Date(now.getTime() + 60_000);

  const ownerA = randomUUID();
  const adminA = randomUUID();
  const memberA = randomUUID();
  const viewerA = randomUUID();
  const ownerB = randomUUID();
  const ownerC = randomUUID();

  const projectA = randomUUID();
  const projectB = randomUUID();
  const projectEmpty = randomUUID();

  // Leads del tenant A (controlan summary, porEstado y conversion).
  const leadNew1 = randomUUID();
  const leadNew2 = randomUUID();
  const leadContacted = randomUUID();
  const leadWon = randomUUID();
  const leadLost = randomUUID();
  const leadWon2 = randomUUID();
  const leadProposal = randomUUID();
  const leadB = randomUUID();

  const userOf = (id: string) => ({
    id,
    name: 'Dashboard Seed',
    email: `dashboard-${id}@flowcommerce.test`,
  });

  const sessionManager = {
    getSession: jest.fn(),
  };

  const cookie = (userId: string) =>
    `flowcommerce.session_token=user.${userId}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SESSION_MANAGER)
      .useValue(sessionManager)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    sessionManager.getSession.mockImplementation((headers: Headers) => {
      const value = headers.get('cookie') ?? '';
      const match = /user\.([0-9a-f-]{36})/i.exec(value);
      const userId = match?.[1];
      if (!userId) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        user: { ...userOf(userId), creadoEn: now, actualizadoEn: now },
        session: {
          id: `session-${userId}`,
          userId,
          expiresAt: future,
        },
      });
    });

    db = app.get(DATABASE_CLIENT);

    // Limpieza defensiva: borra lo que este suite pudo dejar de una corrida
    // anterior abortada.
    await db.delete(quotes).where(eq(quotes.projectId, projectA));
    await db.delete(quotes).where(eq(quotes.projectId, projectB));
    await db.delete(quotes).where(eq(quotes.projectId, projectEmpty));
    await db
      .delete(leads)
      .where(
        inArray(leads.id, [
          leadNew1,
          leadNew2,
          leadContacted,
          leadWon,
          leadLost,
          leadWon2,
          leadProposal,
          leadB,
        ]),
      );
    await db
      .delete(memberships)
      .where(
        inArray(memberships.userId, [
          ownerA,
          adminA,
          memberA,
          viewerA,
          ownerB,
          ownerC,
        ]),
      );
    await db
      .delete(projects)
      .where(inArray(projects.id, [projectA, projectB, projectEmpty]));
    await db
      .delete(users)
      .where(
        inArray(users.id, [ownerA, adminA, memberA, viewerA, ownerB, ownerC]),
      );

    await db
      .insert(users)
      .values([
        userOf(ownerA),
        userOf(adminA),
        userOf(memberA),
        userOf(viewerA),
        userOf(ownerB),
        userOf(ownerC),
      ]);

    await db.insert(projects).values([
      { id: projectA, name: 'Dashboard A', slug: `da-${ownerA}` },
      { id: projectB, name: 'Dashboard B', slug: `db-${ownerB}` },
      { id: projectEmpty, name: 'Dashboard Empty', slug: `de-${ownerC}` },
    ]);

    await db.insert(memberships).values([
      { id: randomUUID(), userId: ownerA, projectId: projectA, role: 'OWNER' },
      { id: randomUUID(), userId: adminA, projectId: projectA, role: 'ADMIN' },
      {
        id: randomUUID(),
        userId: memberA,
        projectId: projectA,
        role: 'MEMBER',
      },
      {
        id: randomUUID(),
        userId: viewerA,
        projectId: projectA,
        role: 'VIEWER',
      },
      { id: randomUUID(), userId: ownerB, projectId: projectB, role: 'OWNER' },
      {
        id: randomUUID(),
        userId: ownerC,
        projectId: projectEmpty,
        role: 'OWNER',
      },
    ]);

    // --- Tenant A: 7 leads → 4 activos (NEW×2, CONTACTED, PROPOSAL), 2 ganados ---
    await db.insert(leads).values([
      {
        id: leadNew1,
        projectId: projectA,
        name: 'New 1',
        stage: LeadStage.NEW,
        createdAt: created('05', '15'),
      },
      {
        id: leadNew2,
        projectId: projectA,
        name: 'New 2',
        stage: LeadStage.NEW,
        createdAt: created('05', '15'),
      },
      {
        id: leadContacted,
        projectId: projectA,
        name: 'Contacted',
        stage: LeadStage.CONTACTED,
        createdAt: created('05', '15'),
      },
      {
        id: leadWon,
        projectId: projectA,
        name: 'Won May',
        stage: LeadStage.WON,
        createdAt: created('05', '20'),
      },
      {
        id: leadLost,
        projectId: projectA,
        name: 'Lost',
        stage: LeadStage.LOST,
        createdAt: created('05', '25'),
      },
      {
        id: leadWon2,
        projectId: projectA,
        name: 'Won Jun',
        stage: LeadStage.WON,
        createdAt: created('06', '10'),
      },
      {
        id: leadProposal,
        projectId: projectA,
        name: 'Proposal Jul',
        stage: LeadStage.PROPOSAL,
        createdAt: created('07', '01'),
      },
    ]);

    // --- Tenant A: 6 cotizaciones con montos y meses fijos ---
    await db.insert(quotes).values([
      {
        id: randomUUID(),
        projectId: projectA,
        leadId: leadNew1,
        folio: 'QA-1',
        subtotal: 2000,
        tax: 200,
        total: 2200,
        status: QuoteStatus.DRAFT,
        createdAt: created('05', '15'),
      },
      {
        id: randomUUID(),
        projectId: projectA,
        leadId: leadNew1,
        folio: 'QA-2',
        subtotal: 1000,
        tax: 100,
        total: 1100,
        status: QuoteStatus.DRAFT,
        createdAt: created('05', '16'),
      },
      {
        id: randomUUID(),
        projectId: projectA,
        leadId: leadNew1,
        folio: 'QA-3',
        subtotal: 1500,
        tax: 150,
        total: 1650,
        status: QuoteStatus.PENDING_APPROVAL,
        createdAt: created('05', '17'),
      },
      {
        id: randomUUID(),
        projectId: projectA,
        leadId: leadNew1,
        folio: 'QA-4',
        subtotal: 3000,
        tax: 300,
        total: 3300,
        status: QuoteStatus.APPROVED,
        createdAt: created('05', '18'),
      },
      {
        id: randomUUID(),
        projectId: projectA,
        leadId: leadNew1,
        folio: 'QA-5',
        subtotal: 4000,
        tax: 400,
        total: 4400,
        status: QuoteStatus.PAID,
        createdAt: created('05', '19'),
        // Pagada en junio: la venta cuenta en el mes del pago, no en el de
        // creación.
        paidAt: created('06', '10'),
      },
      {
        id: randomUUID(),
        projectId: projectA,
        leadId: leadNew1,
        folio: 'QA-6',
        subtotal: 500,
        tax: 50,
        total: 550,
        status: QuoteStatus.APPROVED,
        createdAt: created('06', '05'),
      },
    ]);

    // --- Tenant B: ruido que NUNCA debe aparecer en el dashboard de A ---
    await db.insert(leads).values([
      {
        id: leadB,
        projectId: projectB,
        name: 'B lead',
        stage: LeadStage.NEW,
        createdAt: created('05', '15'),
      },
    ]);
    await db.insert(quotes).values([
      {
        id: randomUUID(),
        projectId: projectB,
        leadId: leadB,
        folio: 'QB-1',
        subtotal: 999999,
        tax: 1,
        total: 1000000,
        status: QuoteStatus.PAID,
        createdAt: created('05', '19'),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(quotes).where(eq(quotes.projectId, projectA));
    await db.delete(quotes).where(eq(quotes.projectId, projectB));
    await db.delete(quotes).where(eq(quotes.projectId, projectEmpty));
    await db
      .delete(leads)
      .where(
        inArray(leads.id, [
          leadNew1,
          leadNew2,
          leadContacted,
          leadWon,
          leadLost,
          leadWon2,
          leadProposal,
          leadB,
        ]),
      );
    await db
      .delete(memberships)
      .where(
        inArray(memberships.userId, [
          ownerA,
          adminA,
          memberA,
          viewerA,
          ownerB,
          ownerC,
        ]),
      );
    await db
      .delete(projects)
      .where(inArray(projects.id, [projectA, projectB, projectEmpty]));
    await db
      .delete(users)
      .where(
        inArray(users.id, [ownerA, adminA, memberA, viewerA, ownerB, ownerC]),
      );
    await app.close();
  });

  const getDashboard = (projectId: string, as?: string) => {
    const requestBuilder = request(app.getHttpServer()).get(
      `/api/v1/projects/${projectId}/dashboard`,
    );
    if (as) {
      requestBuilder.set('Cookie', cookie(as));
    }
    return requestBuilder;
  };

  describe('aggregates', () => {
    it('returns the exact metrics for the tenant', async () => {
      const response = await getDashboard(projectA, ownerA).expect(200);

      expect(response.body).toEqual({
        summary: {
          // NEW (2) + CONTACTED (1) + QUALIFIED (0) + PROPOSAL (1) + NEGOTIATION (0)
          leadsActivos: 4,
          cotizacionesEnRevision: 1,
          // COUNT(leads WON), no un monto
          ganado: 2,
          pipeline: 0,
          seguimientosPendientes: 0,
          seguimientosVencidos: 0,
        },
        leads: {
          porEstado: {
            NEW: 2,
            CONTACTED: 1,
            QUALIFIED: 0,
            PROPOSAL: 1,
            NEGOTIATION: 0,
            WON: 2,
            LOST: 1,
          },
        },
        quotes: {
          porEstado: {
            DRAFT: 2,
            PENDING_APPROVAL: 1,
            APPROVED: 2,
            SENT: 0,
            ACCEPTED: 0,
            PAID: 1,
            REJECTED: 0,
          },
        },
        sales: {
          porEstado: {
            DRAFT: 3300,
            PENDING_APPROVAL: 1650,
            APPROVED: 3850,
            SENT: 0,
            ACCEPTED: 0,
            PAID: 4400,
            REJECTED: 0,
          },
          // Solo cotizaciones PAID, por mes de pago (paid_at): la única PAID
          // de A (4400) se creó en mayo y se pagó en junio.
          porPeriodo: [{ periodo: '2026-06', total: 4400 }],
        },
        conversion: {
          // Por mes de creación del lead: mayo 1 WON de 5, junio 1 de 1,
          // julio 0 de 1.
          porPeriodo: [
            { periodo: '2026-05', creados: 5, ganados: 1, conversion: 0.2 },
            { periodo: '2026-06', creados: 1, ganados: 1, conversion: 1 },
            { periodo: '2026-07', creados: 1, ganados: 0, conversion: 0 },
          ],
        },
        // Sin ?from&to no hay comparación de períodos.
        periodo: null,
      });
    });

    it('keeps sales by period equal to the PAID amount by status', async () => {
      const body = (await getDashboard(projectA, ownerA).expect(200)).body as {
        sales: {
          porEstado: Record<string, number>;
          porPeriodo: { total: number }[];
        };
      };

      // Venta = PAID: el total por período cuadra con el monto PAID por estado.
      const byStatus = body.sales.porEstado.PAID;
      const byPeriod = body.sales.porPeriodo.reduce(
        (acc, entry) => acc + entry.total,
        0,
      );
      expect(byPeriod).toBe(byStatus);
    });

    it('exposes the summary keys, including pending and overdue follow-ups', async () => {
      const body = (await getDashboard(projectA, ownerA).expect(200)).body as {
        summary: Record<string, unknown>;
      };

      expect(Object.keys(body.summary).sort()).toEqual([
        'cotizacionesEnRevision',
        'ganado',
        'leadsActivos',
        'pipeline',
        'seguimientosPendientes',
        'seguimientosVencidos',
      ]);
    });

    it('never leaks another tenant data into the aggregate', async () => {
      // El tenant B sembró una cotización PAID de 1.000.000: si una sola de
      // sus filas se colara, aparecería en alguna de estas métricas.
      const body = (await getDashboard(projectA, ownerA).expect(200))
        .body as Record<string, unknown>;

      expect(JSON.stringify(body)).not.toContain('1000000');
      expect(JSON.stringify(body)).not.toContain('QB-1');
    });

    it('scopes project B dashboard to its own rows', async () => {
      const response = await getDashboard(projectB, ownerB).expect(200);
      const body = response.body as {
        summary: { leadsActivos: number };
        sales: { porEstado: Record<string, number> };
      };

      expect(body.summary.leadsActivos).toBe(1);
      expect(body.sales.porEstado.PAID).toBe(1000000);
    });
  });

  describe('authorization', () => {
    it('OWNER → 200', async () => {
      await getDashboard(projectA, ownerA).expect(200);
    });

    it('ADMIN → 200', async () => {
      await getDashboard(projectA, adminA).expect(200);
    });

    it('MEMBER → 200 (has PROJECT_READ)', async () => {
      await getDashboard(projectA, memberA).expect(200);
    });

    it('VIEWER → 200 (has PROJECT_READ)', async () => {
      await getDashboard(projectA, viewerA).expect(200);
    });

    it('user of project A reading project B dashboard → 403', async () => {
      await getDashboard(projectB, ownerA).expect(403);
    });

    it('non-member of the project → 403', async () => {
      await getDashboard(projectA, ownerB).expect(403);
    });

    it('answers a foreign and a non-existent project identically (403)', async () => {
      const foreign = await getDashboard(projectB, ownerA).expect(403);
      const missing = await getDashboard(randomUUID(), ownerA).expect(403);

      const body = (res: { body: unknown }) => {
        const { statusCode, message, error } = res.body as Record<
          string,
          unknown
        >;
        return { statusCode, message, error };
      };
      expect(body(foreign)).toEqual(body(missing));
    });

    it('invalid projectId → 400', async () => {
      await getDashboard('not-a-uuid', ownerA).expect(400);
    });

    it('requires a session → 401', async () => {
      await getDashboard(projectA).expect(401);
    });
  });

  describe('swagger', () => {
    it('documents the endpoint and its response DTO', () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Flowcommerce API').build(),
      );

      const operation =
        document.paths['/api/v1/projects/{projectId}/dashboard']?.get;
      expect(operation).toBeDefined();
      expect(operation?.tags).toContain('dashboard');

      const schemas = document.components?.schemas ?? {};
      expect(Object.keys(schemas)).toEqual(
        expect.arrayContaining([
          'DashboardDto',
          'DashboardSummaryDto',
          'LeadsPorEstadoDto',
          'QuotesPorEstadoDto',
          'SalesPorEstadoDto',
          'SalesPorPeriodoDto',
          'ConversionPorPeriodoDto',
        ]),
      );
      const summary = schemas.DashboardSummaryDto as {
        properties: Record<string, unknown>;
      };
      expect(Object.keys(summary.properties).sort()).toEqual([
        'cotizacionesEnRevision',
        'ganado',
        'leadsActivos',
        'pipeline',
        'seguimientosPendientes',
        'seguimientosVencidos',
      ]);
    });
  });

  describe('empty project', () => {
    it('returns zeros and empty period series', async () => {
      const response = await getDashboard(projectEmpty, ownerC).expect(200);

      expect(response.body).toEqual({
        summary: {
          leadsActivos: 0,
          cotizacionesEnRevision: 0,
          ganado: 0,
          pipeline: 0,
          seguimientosPendientes: 0,
          seguimientosVencidos: 0,
        },
        leads: {
          porEstado: {
            NEW: 0,
            CONTACTED: 0,
            QUALIFIED: 0,
            PROPOSAL: 0,
            NEGOTIATION: 0,
            WON: 0,
            LOST: 0,
          },
        },
        quotes: {
          porEstado: {
            DRAFT: 0,
            PENDING_APPROVAL: 0,
            APPROVED: 0,
            SENT: 0,
            ACCEPTED: 0,
            PAID: 0,
            REJECTED: 0,
          },
        },
        sales: {
          porEstado: {
            DRAFT: 0,
            PENDING_APPROVAL: 0,
            APPROVED: 0,
            SENT: 0,
            ACCEPTED: 0,
            PAID: 0,
            REJECTED: 0,
          },
          porPeriodo: [],
        },
        conversion: {
          porPeriodo: [],
        },
        periodo: null,
      });
    });
  });

  describe('period filter (?from&to)', () => {
    const june = '?from=2026-06-01T00:00:00Z&to=2026-07-01T00:00:00Z';
    const getRange = (query: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/projects/${projectA}/dashboard${query}`)
        .set('Cookie', cookie(ownerA));

    it('filters quotes, sales and conversion but keeps the current snapshot', async () => {
      const body = (await getRange(june).expect(200)).body as {
        summary: { leadsActivos: number; ganado: number };
        leads: { porEstado: Record<string, number> };
        quotes: { porEstado: Record<string, number> };
        sales: {
          porEstado: Record<string, number>;
          porPeriodo: unknown[];
        };
        conversion: { porPeriodo: unknown[] };
        periodo: unknown;
      };

      // Foto actual: no depende del rango.
      expect(body.summary.leadsActivos).toBe(4);
      expect(body.summary.ganado).toBe(2);
      expect(body.leads.porEstado.NEW).toBe(2);

      // Solo la cotización creada en junio (QA-6, APPROVED 550).
      expect(body.quotes.porEstado.APPROVED).toBe(1);
      expect(body.quotes.porEstado.DRAFT).toBe(0);
      expect(body.sales.porEstado.APPROVED).toBe(550);
      // QA-5 se creó en mayo pero se pagó en junio: cuenta como venta de junio.
      expect(body.sales.porPeriodo).toEqual([
        { periodo: '2026-06', total: 4400 },
      ]);
      expect(body.conversion.porPeriodo).toEqual([
        { periodo: '2026-06', creados: 1, ganados: 1, conversion: 1 },
      ]);

      // Junio dura 30 días: el anterior es [2 may, 1 jun).
      expect(body.periodo).toEqual({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-07-01T00:00:00.000Z',
        actual: {
          ventas: 4400,
          cotizacionesPagadas: 1,
          cotizacionesEnviadas: 0,
          leadsCreados: 1,
          leadsGanados: 1,
          conversion: 1,
        },
        anterior: {
          from: '2026-05-02T00:00:00.000Z',
          to: '2026-06-01T00:00:00.000Z',
          ventas: 0,
          cotizacionesPagadas: 0,
          cotizacionesEnviadas: 0,
          leadsCreados: 5,
          leadsGanados: 1,
          conversion: 0.2,
        },
        variacion: {
          ventas: null,
          cotizacionesEnviadas: null,
          leadsCreados: -80,
        },
      });
    });

    it.each([
      ['only from', '?from=2026-06-01T00:00:00Z'],
      ['to before from', '?from=2026-07-01T00:00:00Z&to=2026-06-01T00:00:00Z'],
      ['an invalid date', '?from=junio&to=2026-07-01T00:00:00Z'],
      [
        'more than 366 days',
        '?from=2025-01-01T00:00:00Z&to=2026-07-01T00:00:00Z',
      ],
    ])('rejects %s with 400', async (_label, query) => {
      await getRange(query).expect(400);
    });
  });
});
