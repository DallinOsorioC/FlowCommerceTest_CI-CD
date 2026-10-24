import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  createE2eApp,
  type E2eContext,
  type SeededTenants,
} from './support/e2e-app';

interface ProductBody {
  id: string;
  name: string;
  price: number;
  maxDiscountPercent: number;
  active: boolean;
  projectId: string;
}

describe('Products (e2e)', () => {
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
  const base = (key: string) =>
    `/api/v1/projects/${seed.project(key)}/products`;
  const as = (key: string, role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') =>
    ctx.cookie(seed.user(key, role));

  const create = async (
    body: Record<string, unknown>,
    key = 'A',
    role: 'OWNER' | 'ADMIN' = 'OWNER',
  ) =>
    (
      await http()
        .post(base(key))
        .set('Cookie', as(key, role))
        .send(body)
        .expect(201)
    ).body as ProductBody;

  describe('CRUD', () => {
    it('creates a product with its price and discount limit', async () => {
      const product = await create({
        name: 'Licencia Pro',
        description: 'Suscripción anual por usuario',
        category: 'Licencias',
        unit: 'usuario',
        price: 1450,
        maxDiscountPercent: 10,
      });

      expect(product).toMatchObject({
        name: 'Licencia Pro',
        price: 1450,
        maxDiscountPercent: 10,
        active: true,
        projectId: seed.project('A'),
      });
    });

    it('rejects a negative price and too many decimals with 400', async () => {
      await http()
        .post(base('A'))
        .set('Cookie', as('A', 'OWNER'))
        .send({ name: 'Malo', price: -1 })
        .expect(400);
      await http()
        .post(base('A'))
        .set('Cookie', as('A', 'OWNER'))
        .send({ name: 'Malo', price: 10.123 })
        .expect(400);
    });

    it('rejects a duplicate name in the same project with 409', async () => {
      await create({ name: 'Duplicado', price: 1 });
      await http()
        .post(base('A'))
        .set('Cookie', as('A', 'OWNER'))
        .send({ name: 'Duplicado', price: 2 })
        .expect(409);
    });

    it('allows the same name in another project', async () => {
      await create({ name: 'Nombre compartido', price: 1 }, 'A');
      await create({ name: 'Nombre compartido', price: 1 }, 'B');
    });

    it('updates, deactivates and filters by active', async () => {
      const product = await create({ name: 'Módulo logística', price: 12300 });

      const updated = await http()
        .patch(`${base('A')}/${product.id}`)
        .set('Cookie', as('A', 'ADMIN'))
        .send({ price: 12500, active: false })
        .expect(200);
      expect(updated.body).toMatchObject({ price: 12500, active: false });

      const activeOnly = await http()
        .get(`${base('A')}?active=true&limit=100`)
        .set('Cookie', as('A', 'MEMBER'))
        .expect(200);
      const names = (activeOnly.body as { data: ProductBody[] }).data.map(
        (item) => item.name,
      );
      expect(names).not.toContain('Módulo logística');

      const inactive = await http()
        .get(`${base('A')}?active=false&limit=100`)
        .set('Cookie', as('A', 'MEMBER'))
        .expect(200);
      expect(
        (inactive.body as { data: ProductBody[] }).data.map((p) => p.name),
      ).toContain('Módulo logística');
    });

    it('rejects an invalid active filter with 400', async () => {
      await http()
        .get(`${base('A')}?active=maybe`)
        .set('Cookie', as('A', 'MEMBER'))
        .expect(400);
    });

    it('searches by name', async () => {
      await create({ name: 'Capacitación presencial', price: 2170 });

      const response = await http()
        .get(`${base('A')}?search=capacit`)
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      const body = response.body as {
        data: ProductBody[];
        meta: { total: number };
      };
      expect(body.data.map((p) => p.name)).toEqual(['Capacitación presencial']);
      expect(body.meta.total).toBe(1);
    });
  });

  describe('permissions', () => {
    it('lets MEMBER and VIEWER read but not manage the catalog', async () => {
      const product = await create({ name: 'Solo lectura', price: 5 });

      for (const role of ['MEMBER', 'VIEWER'] as const) {
        await http()
          .get(`${base('A')}/${product.id}`)
          .set('Cookie', as('A', role))
          .expect(200);
        await http()
          .post(base('A'))
          .set('Cookie', as('A', role))
          .send({ name: `Intento ${role}`, price: 1 })
          .expect(403);
        await http()
          .patch(`${base('A')}/${product.id}`)
          .set('Cookie', as('A', role))
          .send({ price: 0 })
          .expect(403);
      }
    });

    it('requires a session', async () => {
      await http().get(base('A')).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it('forbids reading the catalog of another project (403)', async () => {
      await http().get(base('B')).set('Cookie', as('A', 'OWNER')).expect(403);
    });

    it('returns 404 for a product of another project via my route', async () => {
      const foreign = await create({ name: 'Producto de B', price: 9 }, 'B');

      await http()
        .get(`${base('A')}/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);
      await http()
        .patch(`${base('A')}/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ price: 0 })
        .expect(404);

      const untouched = await http()
        .get(`${base('B')}/${foreign.id}`)
        .set('Cookie', as('B', 'OWNER'))
        .expect(200);
      expect((untouched.body as ProductBody).price).toBe(9);
    });

    it('never lists products of another project', async () => {
      const response = await http()
        .get(`${base('A')}?limit=100`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(200);
      const projectIds = (response.body as { data: ProductBody[] }).data.map(
        (p) => p.projectId,
      );
      expect(new Set(projectIds)).toEqual(new Set([seed.project('A')]));
    });

    it('returns 404 for an unknown product id', async () => {
      await http()
        .get(`${base('A')}/${randomUUID()}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);
    });
  });
});
