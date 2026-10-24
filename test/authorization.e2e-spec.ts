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
import { leads, memberships, projects, users } from '../src/db/schema';
import { SESSION_MANAGER } from '../src/auth/application/ports/session-manager';

describe('Authorization & Multi-tenancy (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;

  const now = new Date();
  const future = new Date(now.getTime() + 60_000);

  // ---------------------------------------------------------------------------
  // Seed data: two isolated tenants (project A and project B).
  // ---------------------------------------------------------------------------
  const ownerA = randomUUID();
  const adminA = randomUUID();
  const memberA = randomUUID();
  const viewerA = randomUUID();
  const ownerB = randomUUID();
  // VIEWER de B: objetivo de los intentos cross-tenant sobre memberships. No es
  // OWNER para que la protección del último OWNER no enmascare el resultado.
  const viewerB = randomUUID();

  // Ids de membership fijos para poder atacarlos por id en los tests.
  const viewerAMembership = randomUUID();
  const viewerBMembership = randomUUID();

  const projectA = randomUUID();
  const projectB = randomUUID();

  // Un lead por tenant: el de B es el que se usa para los intentos de IDOR.
  const leadA = randomUUID();
  const leadB = randomUUID();

  const userOf = (id: string) => ({
    id,
    name: 'Seed User',
    email: `seed-${id}@flowcommerce.test`,
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

    // Idempotent cleanup for the IDs this suite manages.
    await db.delete(leads).where(inArray(leads.id, [leadA, leadB]));
    await db
      .delete(memberships)
      .where(
        inArray(memberships.userId, [
          ownerA,
          adminA,
          memberA,
          viewerA,
          ownerB,
          viewerB,
        ]),
      );
    await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
    await db
      .delete(users)
      .where(
        inArray(users.id, [ownerA, adminA, memberA, viewerA, ownerB, viewerB]),
      );

    await db
      .insert(users)
      .values([
        userOf(ownerA),
        userOf(adminA),
        userOf(memberA),
        userOf(viewerA),
        userOf(ownerB),
        userOf(viewerB),
      ]);

    await db.insert(projects).values([
      { id: projectA, name: 'Project A', slug: `a-${ownerA}` },
      { id: projectB, name: 'Project B', slug: `b-${ownerB}` },
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
        id: viewerAMembership,
        userId: viewerA,
        projectId: projectA,
        role: 'VIEWER',
      },
      { id: randomUUID(), userId: ownerB, projectId: projectB, role: 'OWNER' },
      {
        id: viewerBMembership,
        userId: viewerB,
        projectId: projectB,
        role: 'VIEWER',
      },
    ]);

    await db.insert(leads).values([
      {
        id: leadA,
        projectId: projectA,
        name: 'Lead A',
        email: 'lead-a@example.com',
        phone: null,
      },
      {
        id: leadB,
        projectId: projectB,
        name: 'Lead B',
        email: 'lead-b@example.com',
        phone: null,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(leads).where(inArray(leads.id, [leadA, leadB]));
    await db
      .delete(memberships)
      .where(
        inArray(memberships.userId, [
          ownerA,
          adminA,
          memberA,
          viewerA,
          ownerB,
          viewerB,
        ]),
      );
    await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
    await db
      .delete(users)
      .where(
        inArray(users.id, [ownerA, adminA, memberA, viewerA, ownerB, viewerB]),
      );
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Authentication
  // ---------------------------------------------------------------------------

  it('rejects anonymous requests with 401', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads`)
      .expect(401);
  });

  it('allows a MEMBER to list leads of its own tenant', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(memberA))
      .expect(200);

    const body = response.body as { data: unknown[]; meta: { total: number } };
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.meta.total).toBe('number');
  });

  // ---------------------------------------------------------------------------
  // 2. Role -> permission matrix over leads
  // ---------------------------------------------------------------------------

  it('lets OWNER create a lead', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(ownerA))
      .send({ name: 'Owned lead' })
      .expect(201);

    expect((created.body as { projectId: string }).projectId).toBe(projectA);
  });

  it('lets MEMBER create a lead but not delete it', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(memberA))
      .send({ name: 'Member lead' })
      .expect(201);

    // LEAD_DELETE no está en la matriz de MEMBER: es una operación
    // destructiva en cascada sobre quotes y messages, así que se reserva.
    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectA}/leads/${leadA}`)
      .set('Cookie', cookie(memberA))
      .expect(403);
  });

  it('lets MEMBER update a lead', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectA}/leads/${leadA}`)
      .set('Cookie', cookie(memberA))
      .send({ name: 'Renamed by member' })
      .expect(200);

    // La escritura sí ocurrió: el update no fue un 403 disfrazado.
    const [row] = await db
      .select({ name: leads.name })
      .from(leads)
      .where(and(eq(leads.id, leadA), eq(leads.projectId, projectA)));
    expect(row?.name).toBe('Renamed by member');
  });

  it('forbids VIEWER from creating a lead (403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(viewerA))
      .send({ name: 'Viewer lead' })
      .expect(403);
  });

  it('forbids VIEWER from updating a lead (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectA}/leads/${leadA}`)
      .set('Cookie', cookie(viewerA))
      .send({ name: 'Hijacked by viewer' })
      .expect(403);
  });

  it('lets VIEWER read leads', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(viewerA))
      .expect(200);
  });

  it('lets ADMIN delete project leads', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(adminA))
      .send({ name: 'Admins lead' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(
        `/api/v1/projects/${projectA}/leads/${
          (created.body as { id: string }).id
        }`,
      )
      .set('Cookie', cookie(adminA))
      .expect(204);
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-tenancy / BOLA (tenant A user must not reach tenant B)
  // ---------------------------------------------------------------------------

  it('denies access to a project the user is not a member of (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectB}/leads`)
      .set('Cookie', cookie(ownerA))
      .expect(403);
  });

  it('denies the owner of B from listing members of A (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/members`)
      .set('Cookie', cookie(ownerB))
      .expect(403);
  });

  // ---------------------------------------------------------------------------
  // 4. IDOR: knowing another tenant's lead id must not grant access
  // ---------------------------------------------------------------------------

  it('returns 404 when fetching a lead from another tenant by id', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads/${leadB}`)
      .set('Cookie', cookie(ownerA))
      .expect(404);
  });

  it('returns 404 when updating a lead from another tenant', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectA}/leads/${leadB}`)
      .set('Cookie', cookie(adminA))
      .send({ name: 'Hijacked' })
      .expect(404);

    // Y el lead de B sigue intacto: el 404 no es solo cosmético.
    const [row] = await db
      .select({ name: leads.name })
      .from(leads)
      .where(and(eq(leads.id, leadB), eq(leads.projectId, projectB)));
    expect(row?.name).toBe('Lead B');
  });

  it('returns 404 when deleting a lead from another tenant', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectA}/leads/${leadB}`)
      .set('Cookie', cookie(ownerA))
      .expect(404);

    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadB), eq(leads.projectId, projectB)));
    expect(rows).toHaveLength(1);
  });

  it('does not leak leads from other tenants in list()', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(memberA))
      .expect(200);

    const body = response.body as { data: { id: string }[] };
    expect(body.data.some((lead) => lead.id === leadB)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 5. Dynamic filters + pagination
  // ---------------------------------------------------------------------------

  it('filters by stage', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/leads`)
      .set('Cookie', cookie(ownerA))
      .send({ name: 'Filterable lead', stage: 'QUALIFIED' })
      .expect(201);
    const id = (created.body as { id: string }).id;

    const response = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?stage=QUALIFIED`)
      .set('Cookie', cookie(ownerA))
      .expect(200);

    const body = response.body as { data: { id: string }[] };
    expect(body.data.some((lead) => lead.id === id)).toBe(true);

    // Un filtro que no coincide con nada devuelve la página vacía, no un 404.
    const other = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?stage=LOST`)
      .set('Cookie', cookie(ownerA))
      .expect(200);
    expect(
      (other.body as { data: unknown[] }).data.some(
        (lead) => (lead as { id: string }).id === id,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectA}/leads/${id}`)
      .set('Cookie', cookie(ownerA))
      .expect(204);
  });

  it('searches across name, email and phone', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?search=lead-a`)
      .set('Cookie', cookie(ownerA))
      .expect(200);

    const body = response.body as { data: { id: string }[] };
    expect(body.data.some((lead) => lead.id === leadA)).toBe(true);
  });

  it('rejects an unknown stage filter with 400', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?stage=NOPE`)
      .set('Cookie', cookie(ownerA))
      .expect(400);
  });

  it('rejects an out-of-range limit with 400', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?limit=0`)
      .set('Cookie', cookie(ownerA))
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?limit=101`)
      .set('Cookie', cookie(ownerA))
      .expect(400);
  });

  it('paginates and reports a total for the whole tenant', async () => {
    const first = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?page=1&limit=1`)
      .set('Cookie', cookie(ownerA))
      .expect(200);

    const firstBody = first.body as {
      data: unknown[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    };
    expect(firstBody.data).toHaveLength(1);
    expect(firstBody.meta).toMatchObject({ page: 1, limit: 1 });
    // El total cuenta TODAS las filas del tenant, no solo las de la página.
    expect(firstBody.meta.total).toBeGreaterThan(1);
    expect(firstBody.meta.totalPages).toBe(firstBody.meta.total);

    const second = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/leads?page=2&limit=1`)
      .set('Cookie', cookie(ownerA))
      .expect(200);

    const secondBody = second.body as {
      data: { id: string }[];
      meta: { total: number };
    };
    // La segunda página trae otra fila, no una repetición de la primera.
    expect(secondBody.meta.total).toBe(firstBody.meta.total);
    expect(secondBody.data[0]?.id).not.toBe(
      (firstBody.data[0] as { id: string }).id,
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Ownership rules (project A: ownerA is the single OWNER)
  // ---------------------------------------------------------------------------

  it('blocks demoting the last OWNER (403)', async () => {
    const membership = (await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/members`)
      .set('Cookie', cookie(ownerA))
      .expect(200)) as unknown as {
      body: { id: string; userId: string; role: string }[];
    };

    const ownerMembership = membership.body.find(
      (member) => member.userId === ownerA,
    );
    expect(ownerMembership?.role).toBe('OWNER');

    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectA}/members/${ownerMembership!.id}`)
      .set('Cookie', cookie(ownerA))
      .send({ role: 'MEMBER' })
      .expect(403);
  });

  it('blocks removing the last OWNER (403)', async () => {
    const membership = (await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/members`)
      .set('Cookie', cookie(ownerA))
      .expect(200)) as unknown as { body: { id: string; userId: string }[] };

    const ownerMembership = membership.body.find(
      (member) => member.userId === ownerA,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectA}/members/${ownerMembership!.id}`)
      .set('Cookie', cookie(ownerA))
      .expect(403);
  });

  it('prevents ADMIN from managing the OWNER (403)', async () => {
    const membership = (await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectA}/members`)
      .set('Cookie', cookie(ownerA))
      .expect(200)) as unknown as { body: { id: string; userId: string }[] };

    const ownerMembership = membership.body.find(
      (member) => member.userId === ownerA,
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectA}/members/${ownerMembership!.id}`)
      .set('Cookie', cookie(adminA))
      .send({ role: 'MEMBER' })
      .expect(403);
  });

  it('prevents VIEWER from inviting members (403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/members`)
      .set('Cookie', cookie(viewerA))
      .send({ userId: randomUUID(), role: 'MEMBER' })
      .expect(403);
  });

  // ---------------------------------------------------------------------------
  // 7. Members: a MEMBER cannot manage memberships (T2)
  //
  // Por jerarquía de roles un MEMBER SÍ podría gestionar a un VIEWER
  // (canManageRole/canAssignRole). Lo que lo impide es el permiso:
  // MEMBER_INVITE, MEMBER_UPDATE_ROLE y MEMBER_REMOVE son solo de OWNER/ADMIN.
  // ---------------------------------------------------------------------------

  const findMembership = async (id: string) => {
    const [row] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, id));
    return row;
  };

  it('forbids MEMBER from inviting a member, even with a lower role (403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectA}/members`)
      .set('Cookie', cookie(memberA))
      .send({ userId: viewerB, role: 'VIEWER' })
      .expect(403);

    const [created] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, viewerB),
          eq(memberships.projectId, projectA),
        ),
      );
    expect(created).toBeUndefined();
  });

  it('forbids MEMBER from changing the role of a VIEWER (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectA}/members/${viewerAMembership}`)
      .set('Cookie', cookie(memberA))
      .send({ role: 'VIEWER' })
      .expect(403);

    expect((await findMembership(viewerAMembership))?.role).toBe('VIEWER');
  });

  it('forbids MEMBER from removing a VIEWER (403)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectA}/members/${viewerAMembership}`)
      .set('Cookie', cookie(memberA))
      .expect(403);

    expect(await findMembership(viewerAMembership)).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 8. Members: cross-tenant membershipId (T1)
  //
  // ownerA es OWNER de A (jerarquía máxima), así que solo el filtro
  // `WHERE id = ? AND project_id = ?` impide tocar una membership de B usando
  // la ruta de A. Debe responder 404 (como si no existiera) y B no cambia.
  // ---------------------------------------------------------------------------

  it('returns 404 when changing the role of a membership of another project', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectA}/members/${viewerBMembership}`)
      .set('Cookie', cookie(ownerA))
      .send({ role: 'ADMIN' })
      .expect(404);

    const untouched = await findMembership(viewerBMembership);
    expect(untouched?.projectId).toBe(projectB);
    expect(untouched?.role).toBe('VIEWER');
  });

  it('returns 404 when removing a membership of another project', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectA}/members/${viewerBMembership}`)
      .set('Cookie', cookie(ownerA))
      .expect(404);

    const untouched = await findMembership(viewerBMembership);
    expect(untouched?.projectId).toBe(projectB);
    expect(untouched?.role).toBe('VIEWER');
  });
});
