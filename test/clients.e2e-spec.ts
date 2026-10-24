import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

interface ClientBody {
  id: string;
  projectId: string;
  name: string;
  company: string | null;
  taxId: string | null;
  assignedUserId: string | null;
  assignedUser: { id: string; name: string } | null;
  active: boolean;
}

describe('Clients (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, ADMIN: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const base = (key: string) => `/api/v1/projects/${seed.project(key)}/clients`;
  const as = (key: string, role: Role) => ctx.cookie(seed.user(key, role));

  const create = async (
    body: Record<string, unknown>,
    key = 'A',
    role: Role = 'MEMBER',
  ) =>
    (
      await http()
        .post(base(key))
        .set('Cookie', as(key, role))
        .send(body)
        .expect(201)
    ).body as ClientBody;

  describe('CRUD', () => {
    it('creates a client with a responsible member of the project', async () => {
      const client = await create({
        name: 'Rodrigo Castillo',
        company: 'Transportes Quetzal',
        taxId: '7745213-8',
        email: 'rcastillo@tquetzal.gt',
        assignedUserId: seed.user('A', 'MEMBER'),
      });

      expect(client).toMatchObject({
        name: 'Rodrigo Castillo',
        company: 'Transportes Quetzal',
        projectId: seed.project('A'),
        assignedUserId: seed.user('A', 'MEMBER'),
        active: true,
      });
      expect(client.assignedUser?.id).toBe(seed.user('A', 'MEMBER'));
    });

    it('rejects a responsible user from another project with 400', async () => {
      await http()
        .post(base('A'))
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: 'Intruso', assignedUserId: seed.user('B', 'OWNER') })
        .expect(400);
    });

    it('rejects a duplicate tax id in the same project with 409', async () => {
      await create({ name: 'NIT único', taxId: 'NIT-DUP-1' });
      await http()
        .post(base('A'))
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: 'Otro', taxId: 'NIT-DUP-1' })
        .expect(409);
      // Mismo NIT en otro proyecto: permitido.
      await create({ name: 'En B', taxId: 'NIT-DUP-1' }, 'B', 'OWNER');
    });

    it('updates, deactivates and filters', async () => {
      const client = await create({ name: 'Grupo Atlas', company: 'Atlas' });

      const updated = await http()
        .patch(`${base('A')}/${client.id}`)
        .set('Cookie', as('A', 'MEMBER'))
        .send({ phone: '+502 4477 1191', active: false })
        .expect(200);
      expect(updated.body).toMatchObject({
        phone: '+502 4477 1191',
        active: false,
      });

      const active = await http()
        .get(`${base('A')}?active=true&limit=100`)
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      expect(
        (active.body as { data: ClientBody[] }).data.map((c) => c.id),
      ).not.toContain(client.id);
    });

    it('searches by company and sorts by name', async () => {
      await create({ name: 'Zeta Pineda', company: 'Soluciones GT' });
      await create({ name: 'Ana Pineda', company: 'Soluciones GT' });

      const response = await http()
        .get(`${base('A')}?search=soluciones&sortBy=name&order=asc`)
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      expect(
        (response.body as { data: ClientBody[] }).data.map((c) => c.name),
      ).toEqual(['Ana Pineda', 'Zeta Pineda']);
    });

    it('deletes a client without history (OWNER/ADMIN only)', async () => {
      const client = await create({ name: 'Para borrar' });

      await http()
        .delete(`${base('A')}/${client.id}`)
        .set('Cookie', as('A', 'MEMBER'))
        .expect(403);
      await http()
        .delete(`${base('A')}/${client.id}`)
        .set('Cookie', as('A', 'ADMIN'))
        .expect(204);
      await http()
        .get(`${base('A')}/${client.id}`)
        .set('Cookie', as('A', 'ADMIN'))
        .expect(404);
    });
  });

  describe('permissions', () => {
    it('lets VIEWER read but not write', async () => {
      const client = await create({ name: 'Solo lectura' });

      await http()
        .get(`${base('A')}/${client.id}`)
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      await http()
        .post(base('A'))
        .set('Cookie', as('A', 'VIEWER'))
        .send({ name: 'No' })
        .expect(403);
      await http()
        .patch(`${base('A')}/${client.id}`)
        .set('Cookie', as('A', 'VIEWER'))
        .send({ name: 'No' })
        .expect(403);
    });

    it('requires a session', async () => {
      await http().get(base('A')).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it('forbids another project (403)', async () => {
      await http().get(base('B')).set('Cookie', as('A', 'OWNER')).expect(403);
    });

    it('returns 404 for a client of another project and changes nothing', async () => {
      const foreign = await create({ name: 'Cliente de B' }, 'B', 'OWNER');

      await http()
        .get(`${base('A')}/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);
      await http()
        .patch(`${base('A')}/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ name: 'Hackeado' })
        .expect(404);
      await http()
        .delete(`${base('A')}/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);

      const untouched = await http()
        .get(`${base('B')}/${foreign.id}`)
        .set('Cookie', as('B', 'OWNER'))
        .expect(200);
      expect((untouched.body as ClientBody).name).toBe('Cliente de B');
    });

    it('never lists clients of another project', async () => {
      const response = await http()
        .get(`${base('A')}?limit=100`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(200);
      const projects = (response.body as { data: ClientBody[] }).data.map(
        (c) => c.projectId,
      );
      expect(new Set(projects)).toEqual(new Set([seed.project('A')]));
    });

    it('returns 404 for an unknown client', async () => {
      await http()
        .get(`${base('A')}/${randomUUID()}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);
    });
  });
});
