import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import type { Database } from '../src/db';
import { DATABASE_CLIENT } from '../src/db/database.constants';
import {
  leads,
  memberships,
  messages,
  projects,
  users,
} from '../src/db/schema';
import { SESSION_MANAGER } from '../src/auth/application/ports/session-manager';
import { WHATSAPP_GATEWAY } from '../src/messages/domain/ports/whatsapp.gateway';
import { StubWhatsAppGateway } from '../src/messages/infrastructure/whatsapp/stub-whatsapp.gateway';
import { signWhatsAppPayload } from '../src/messages/infrastructure/whatsapp/whatsapp-webhook.signature';

describe('WhatsApp messages (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;

  const now = new Date();
  const future = new Date(now.getTime() + 60_000);

  const ownerA = randomUUID();
  const viewerA = randomUUID();
  const ownerB = randomUUID();

  const projectA = randomUUID();
  const projectB = randomUUID();

  const leadA = randomUUID();
  const leadB = randomUUID();

  const appSecret = 'e2e-whatsapp-app-secret';
  const verifyToken = 'e2e-whatsapp-verify-token';

  const userOf = (id: string) => ({
    id,
    name: 'Seed User',
    email: `msg-${id}@flowcommerce.test`,
  });

  const sessionManager = {
    getSession: jest.fn(),
  };

  const cookie = (userId: string) =>
    `flowcommerce.session_token=user.${userId}`;

  beforeAll(async () => {
    process.env.WHATSAPP_APP_SECRET = appSecret;
    process.env.WHATSAPP_VERIFY_TOKEN = verifyToken;
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'e2e-phone-id';
    process.env.WHATSAPP_PROJECT_ID = projectA;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SESSION_MANAGER)
      .useValue(sessionManager)
      .overrideProvider(WHATSAPP_GATEWAY)
      .useClass(StubWhatsAppGateway)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
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

    await db
      .delete(messages)
      .where(inArray(messages.projectId, [projectA, projectB]));
    await db.delete(leads).where(inArray(leads.id, [leadA, leadB]));
    await db
      .delete(memberships)
      .where(inArray(memberships.userId, [ownerA, viewerA, ownerB]));
    await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
    await db.delete(users).where(inArray(users.id, [ownerA, viewerA, ownerB]));

    await db
      .insert(users)
      .values([userOf(ownerA), userOf(viewerA), userOf(ownerB)]);

    await db.insert(projects).values([
      { id: projectA, name: 'Messages A', slug: `ma-${ownerA}` },
      { id: projectB, name: 'Messages B', slug: `mb-${ownerB}` },
    ]);

    await db.insert(memberships).values([
      { id: randomUUID(), userId: ownerA, projectId: projectA, role: 'OWNER' },
      {
        id: randomUUID(),
        userId: viewerA,
        projectId: projectA,
        role: 'VIEWER',
      },
      { id: randomUUID(), userId: ownerB, projectId: projectB, role: 'OWNER' },
    ]);

    await db.insert(leads).values([
      {
        id: leadA,
        projectId: projectA,
        name: 'Lead A',
        phone: '+52 55 1234 5678',
      },
      {
        id: leadB,
        projectId: projectB,
        name: 'Lead B',
        phone: '+52 55 1234 5678',
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(messages)
      .where(inArray(messages.projectId, [projectA, projectB]));
    await db.delete(leads).where(inArray(leads.id, [leadA, leadB]));
    await db
      .delete(memberships)
      .where(inArray(memberships.userId, [ownerA, viewerA, ownerB]));
    await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
    await db.delete(users).where(inArray(users.id, [ownerA, viewerA, ownerB]));
    await app.close();
  });

  it('sends an outbound message scoped to the project lead', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads/${leadA}/messages`)
      .set('Cookie', cookie(ownerA))
      .send({ content: 'Hola, le comparto la propuesta.' })
      .expect(201);

    const body = response.body as {
      projectId: string;
      leadId: string;
      direction: string;
      whatsappMessageId: string;
    };

    expect(body.projectId).toBe(projectA);
    expect(body.leadId).toBe(leadA);
    expect(body.direction).toBe('OUTBOUND');
    expect(body.whatsappMessageId).toMatch(/^wamid\.stub\./);
  });

  it('returns 404 when sending to a lead from another tenant (IDOR)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads/${leadB}/messages`)
      .set('Cookie', cookie(ownerA))
      .send({ content: 'No deberia enviarse' })
      .expect(404);
  });

  it('forbids VIEWER from sending WhatsApp messages', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads/${leadA}/messages`)
      .set('Cookie', cookie(viewerA))
      .send({ content: 'Vista no envia' })
      .expect(403);
  });

  it('verifies the Meta webhook subscription challenge', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': 'challenge-e2e',
      })
      .expect(200);

    expect(response.text).toBe('challenge-e2e');
  });

  it('persists inbound webhooks only for the bound projectId', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'e2e-phone-id' },
                messages: [
                  {
                    from: '525512345678',
                    id: `wamid.in.${randomUUID()}`,
                    type: 'text',
                    text: { body: 'Quiero cotizar' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const rawBody = Buffer.from(JSON.stringify(payload));

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('X-Hub-Signature-256', signWhatsAppPayload(rawBody, appSecret))
      .set('Content-Type', 'application/json')
      .send(rawBody.toString('utf8'))
      .expect(200);

    const inboundA = await db
      .select()
      .from(messages)
      .where(and(eq(messages.projectId, projectA), eq(messages.leadId, leadA)));
    const inboundB = await db
      .select()
      .from(messages)
      .where(and(eq(messages.projectId, projectB), eq(messages.leadId, leadB)));

    expect(inboundA.some((row) => row.direction === 'INBOUND')).toBe(true);
    expect(inboundB).toHaveLength(0);
  });

  const postWebhook = (payload: object) => {
    const rawBody = Buffer.from(JSON.stringify(payload));
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('X-Hub-Signature-256', signWhatsAppPayload(rawBody, appSecret))
      .set('Content-Type', 'application/json')
      .send(rawBody.toString('utf8'));
  };

  const inbound = (from: string, body: string, name?: string) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'e2e-phone-id' },
              contacts: name ? [{ wa_id: from, profile: { name } }] : [],
              messages: [
                {
                  from,
                  id: `wamid.in.${randomUUID()}`,
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  describe('conversations', () => {
    type Conversation = {
      lead: { id: string; name: string };
      lastMessage: { content: string };
      unreadCount: number;
      windowOpenUntil: string | null;
    };
    const inbox = (as: string, query = '') =>
      request(app.getHttpServer())
        .get(`/api/v1/projects/${projectA}/conversations${query}`)
        .set('Cookie', cookie(as));

    it('lists the lead with its last message, unread count and open window (VIEWER can read)', async () => {
      await postWebhook(
        inbound('525512345678', '¿Me envían el precio?'),
      ).expect(200);

      const body = (await inbox(viewerA).expect(200)).body as {
        data: Conversation[];
        meta: { total: number };
      };
      const conversation = body.data.find((item) => item.lead.id === leadA);

      expect(conversation?.lastMessage.content).toBe('¿Me envían el precio?');
      expect(conversation?.unreadCount).toBeGreaterThanOrEqual(1);
      expect(
        new Date(conversation?.windowOpenUntil ?? 0).getTime(),
      ).toBeGreaterThan(Date.now());
      // Nunca aparecen conversaciones de otro tenant.
      expect(body.data.some((item) => item.lead.id === leadB)).toBe(false);
    });

    it('returns the chat history in reading order and pages back with the cursor', async () => {
      const first = (
        await request(app.getHttpServer())
          .get(`/api/v1/projects/${projectA}/leads/${leadA}/messages?limit=1`)
          .set('Cookie', cookie(viewerA))
          .expect(200)
      ).body as {
        data: { id: string; content: string }[];
        nextCursor: string | null;
      };
      expect(first.data).toHaveLength(1);
      expect(first.data[0].content).toBe('¿Me envían el precio?');
      expect(first.nextCursor).toBe(first.data[0].id);

      const older = (
        await request(app.getHttpServer())
          .get(
            `/api/v1/projects/${projectA}/leads/${leadA}/messages?limit=100&before=${first.nextCursor}`,
          )
          .set('Cookie', cookie(viewerA))
          .expect(200)
      ).body as { data: { id: string }[]; nextCursor: string | null };
      expect(older.data.length).toBeGreaterThanOrEqual(1);
      expect(older.data.map((item) => item.id)).not.toContain(first.data[0].id);
      expect(older.nextCursor).toBeNull();
    });

    it('marks the conversation as read (VIEWER cannot) and updates the counters', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectA}/leads/${leadA}/messages/read`)
        .set('Cookie', cookie(viewerA))
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectA}/leads/${leadA}/messages/read`)
        .set('Cookie', cookie(ownerA))
        .expect(204);

      const unread = (await inbox(ownerA, '?unread=true').expect(200)).body as {
        data: Conversation[];
      };
      expect(unread.data.some((item) => item.lead.id === leadA)).toBe(false);

      const counters = (await inbox(ownerA, '/unread-count').expect(200))
        .body as { conversations: number; messages: number };
      expect(counters).toEqual({ conversations: 0, messages: 0 });
    });

    it('answers 404 for the chat of a lead of another tenant', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectA}/leads/${leadB}/messages`)
        .set('Cookie', cookie(ownerA))
        .expect(404);
    });

    it('creates a WHATSAPP lead when an unknown number writes', async () => {
      await postWebhook(
        inbound('5215599990000', 'Hola, vi su anuncio', 'Carla Nueva'),
      ).expect(200);

      const created = await db
        .select()
        .from(leads)
        .where(
          and(eq(leads.projectId, projectA), eq(leads.phone, '+5215599990000')),
        );
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        name: 'Carla Nueva',
        source: 'WHATSAPP',
        stage: 'NEW',
      });
      expect(created[0].lastContactAt).not.toBeNull();

      // Un segundo mensaje del mismo número no crea otro lead.
      await postWebhook(inbound('5215599990000', 'Sigo aquí')).expect(200);
      const again = await db
        .select()
        .from(leads)
        .where(
          and(eq(leads.projectId, projectA), eq(leads.phone, '+5215599990000')),
        );
      expect(again).toHaveLength(1);
    });
  });

  it('rejects webhooks with an invalid signature', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('X-Hub-Signature-256', 'sha256=00')
      .send({ object: 'whatsapp_business_account' })
      .expect(403);
  });
});
