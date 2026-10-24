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
import { accessRequests, memberships, projects, users } from '../src/db/schema';
import { IDENTITY_ADMIN } from '../src/auth/application/ports/identity-admin';
import { SESSION_MANAGER } from '../src/auth/application/ports/session-manager';

describe('Access requests (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;

  const now = new Date();
  const future = new Date(now.getTime() + 60_000);

  const ownerA = randomUUID();
  const memberA = randomUUID();
  const viewerA = randomUUID();
  const ownerB = randomUUID();

  const projectA = randomUUID();
  const projectB = randomUUID();

  // Emails únicos por ejecución para no colisionar con otros guardados.
  const inviteEmail = `invited-${randomUUID()}@flowcommerce.test`;
  const duplicateEmail = `ducero-${randomUUID()}@flowcommerce.test`;

  const requestA = randomUUID();
  const requestB = randomUUID();

  const userOf = (id: string) => ({
    id,
    name: 'Seed User',
    email: `seed-${id}@flowcommerce.test`,
  });

  const sentLinks: { email: string }[] = [];

  const sessionManager = {
    getSession: jest.fn(),
  };

  // Supabase Auth de mentira: crea la cuenta con un id nuevo y «envía» la
  // invitación.
  const identityAdmin = {
    inviteByEmail: jest.fn(({ email }: { email: string }) => {
      sentLinks.push({ email });
      return Promise.resolve({ id: randomUUID(), alreadyExisted: false });
    }),
    createConfirmedUser: jest.fn(),
  };

  const cookie = (userId: string) =>
    `flowcommerce.session_token=user.${userId}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SESSION_MANAGER)
      .useValue(sessionManager)
      .overrideProvider(IDENTITY_ADMIN)
      .useValue(identityAdmin)
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

    // Cleanup idempotente de los ids que maneja este suite.
    await db
      .delete(accessRequests)
      .where(inArray(accessRequests.id, [requestA, requestB]));
    await db
      .delete(memberships)
      .where(inArray(memberships.userId, [ownerA, memberA, viewerA, ownerB]));
    await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
    await db
      .delete(users)
      .where(inArray(users.id, [ownerA, memberA, viewerA, ownerB]));

    await db
      .insert(users)
      .values([
        userOf(ownerA),
        userOf(memberA),
        userOf(viewerA),
        userOf(ownerB),
      ]);

    await db.insert(projects).values([
      { id: projectA, name: 'Project A', slug: `a-${ownerA}` },
      { id: projectB, name: 'Project B', slug: `b-${ownerB}` },
    ]);

    await db.insert(memberships).values([
      { id: randomUUID(), userId: ownerA, projectId: projectA, role: 'OWNER' },
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
    ]);

    await db.insert(accessRequests).values([
      {
        id: requestA,
        projectId: projectA,
        email: inviteEmail,
        status: 'PENDING',
      },
      {
        id: requestB,
        projectId: projectB,
        email: duplicateEmail,
        status: 'PENDING',
      },
    ]);
  });

  afterAll(async () => {
    // El approve() crea usuario + membership reales en la DB.
    await db
      .delete(accessRequests)
      .where(inArray(accessRequests.email, [inviteEmail, duplicateEmail]));
    await db
      .delete(memberships)
      .where(inArray(memberships.userId, [ownerA, memberA, viewerA, ownerB]));
    await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
    await db
      .delete(users)
      .where(
        inArray(users.email, [
          `seed-${ownerA}@flowcommerce.test`,
          `seed-${memberA}@flowcommerce.test`,
          `seed-${viewerA}@flowcommerce.test`,
          `seed-${ownerB}@flowcommerce.test`,
          inviteEmail,
        ]),
      );
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Public: POST /api/v1/auth/access-requests
  // ---------------------------------------------------------------------------

  describe('public create', () => {
    // Normalización de mayúsculas: outlook no remueve puntos en normalizeEmail.
    const email = `Applicant.${randomUUID()}@Outlook.com`;
    const projectId = projectA;

    const pendingCount = async (forEmail: string) =>
      (
        await db
          .select({ id: accessRequests.id })
          .from(accessRequests)
          .where(eq(accessRequests.email, forEmail))
      ).length;

    it('creates a PENDING request, normalizing the email, and answers 202', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId, email: email.toUpperCase() })
        .expect(202);

      expect(Object.keys(response.body as object)).toEqual(['message']);
      const rows = await db
        .select()
        .from(accessRequests)
        .where(eq(accessRequests.email, email.toLowerCase()));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ projectId, status: 'PENDING' });
    });

    it('answers exactly the same for a duplicate PENDING request and creates nothing', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId, email })
        .expect(202);

      expect(await pendingCount(email.toLowerCase())).toBe(1);
      const fresh = await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId, email: `new.${randomUUID()}@outlook.com` })
        .expect(202);
      // Mismo cuerpo para un correo nuevo y para uno ya solicitado.
      expect(first.body).toEqual(fresh.body);
    });

    it('does not reveal that an email belongs to a user (same 202, nothing created)', async () => {
      const existing = `seed-${ownerA}@flowcommerce.test`;
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId: projectB, email: existing })
        .expect(202);

      const fresh = await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({
          projectId: projectB,
          email: `other.${randomUUID()}@outlook.com`,
        })
        .expect(202);
      expect(response.body).toEqual(fresh.body);
      expect(await pendingCount(existing)).toBe(0);
    });

    it('returns 404 for an unknown project', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId: randomUUID(), email: 'ghost@flowcommerce.test' })
        .expect(404);
    });

    it('returns 400 for an invalid body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId, email: 'not-an-email' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ email: 'ok@flowcommerce.test' })
        .expect(400);
    });

    it('allows a new request once the previous one was resolved', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectB}/access-requests/${requestB}/reject`)
        .set('Cookie', cookie(ownerB))
        .expect(200);

      const again = await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId: projectB, email: duplicateEmail })
        .expect(202);

      expect(again.body).toHaveProperty('message');
      const pendings = await db
        .select({ id: accessRequests.id })
        .from(accessRequests)
        .where(
          and(
            eq(accessRequests.email, duplicateEmail),
            eq(accessRequests.status, 'PENDING'),
          ),
        );
      expect(pendings).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Protected: list / approve / reject
  // ---------------------------------------------------------------------------

  describe('protected access-requests endpoints', () => {
    // El POST público ya no devuelve la solicitud (anti-enumeración): el id se
    // lee de la base.
    const requestAccess = async (
      forProject: string,
      forEmail: string,
    ): Promise<string> => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({ projectId: forProject, email: forEmail })
        .expect(202);

      const [row] = await db
        .select({ id: accessRequests.id })
        .from(accessRequests)
        .where(eq(accessRequests.email, forEmail));
      return row.id;
    };

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectA}/access-requests`)
        .expect(401);
    });

    it('allows OWNER to list the project requests', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectA}/access-requests`)
        .set('Cookie', cookie(ownerA))
        .expect(200);

      const body = response.body as { projectId: string; status: string }[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((r) => r.status === 'PENDING')).toBe(true);
    });

    it('forbids MEMBER and VIEWER (MEMBER_INVITE is OWNER/ADMIN only)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectA}/access-requests`)
        .set('Cookie', cookie(memberA))
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectA}/access-requests`)
        .set('Cookie', cookie(viewerA))
        .expect(403);
    });

    it('forbids MEMBER and VIEWER from approving a request (403)', async () => {
      const id = await requestAccess(
        projectA,
        `role-approve-${randomUUID()}@flowcommerce.test`,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectA}/access-requests/${id}/approve`)
        .set('Cookie', cookie(memberA))
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectA}/access-requests/${id}/approve`)
        .set('Cookie', cookie(viewerA))
        .expect(403);

      // Ni siquiera se intentó consumir el PENDING: sigue ahí para quien sí
      // tiene permiso.
      const rows = await db
        .select({ status: accessRequests.status })
        .from(accessRequests)
        .where(eq(accessRequests.id, id));
      expect(rows[0]?.status).toBe('PENDING');
    });

    it('forbids MEMBER and VIEWER from rejecting a request (403)', async () => {
      const id = await requestAccess(
        projectA,
        `role-reject-${randomUUID()}@flowcommerce.test`,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectA}/access-requests/${id}/reject`)
        .set('Cookie', cookie(memberA))
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectA}/access-requests/${id}/reject`)
        .set('Cookie', cookie(viewerA))
        .expect(403);

      const rows = await db
        .select({ status: accessRequests.status })
        .from(accessRequests)
        .where(eq(accessRequests.id, id));
      expect(rows[0]?.status).toBe('PENDING');
    });

    it('denies access to a project the user does not belong to', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectB}/access-requests`)
        .set('Cookie', cookie(ownerA))
        .expect(403);
    });

    it('approves a request: creates user + membership and sends a set-password link', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/projects/${projectA}/access-requests/${requestA}/approve`,
        )
        .set('Cookie', cookie(ownerA))
        .expect(200);

      expect(response.body).toMatchObject({
        id: requestA,
        projectId: projectA,
        status: 'APPROVED',
        atendidoPorUserId: ownerA,
      });

      // Y en la base: usuario, membership MEMBER y enlace (nunca una contraseña).
      const [createdUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, [inviteEmail]));
      expect(createdUser).toBeDefined();

      const [createdMembership] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(inArray(memberships.userId, [createdUser.id]));
      expect(createdMembership?.role).toBe('MEMBER');

      expect(sentLinks.map((l) => l.email)).toContain(inviteEmail);
    });

    it('cannot approve an already-handled request (409)', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/projects/${projectA}/access-requests/${requestA}/approve`,
        )
        .set('Cookie', cookie(ownerA))
        .expect(409);
    });

    it('returns 404 approving a request that belongs to another project', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/projects/${projectA}/access-requests/${requestB}/approve`,
        )
        .set('Cookie', cookie(ownerA))
        .expect(404);
    });

    it('rejects a PENDING request', async () => {
      const id = await requestAccess(
        projectB,
        `to-reject-${randomUUID()}@flowcommerce.test`,
      );

      const response = await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectB}/access-requests/${id}/reject`)
        .set('Cookie', cookie(ownerB))
        .expect(200);

      expect(response.body).toMatchObject({
        id,
        status: 'REJECTED',
        atendidoPorUserId: ownerB,
      });

      // Ya resuelta → no se puede volver a aprobar/rechazar.
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectB}/access-requests/${id}/approve`)
        .set('Cookie', cookie(ownerB))
        .expect(409);
    });
  });
});
