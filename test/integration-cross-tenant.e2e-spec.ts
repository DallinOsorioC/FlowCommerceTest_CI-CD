import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { clients, leads, quoteItems, quotes } from '../src/db/schema';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

interface Ids {
  lead: string;
  client: string;
  product: string;
  quote: string;
}

interface DashboardBody {
  summary: {
    leadsActivos: number;
    ganado: number;
    pipeline: number;
  };
  quotes: { porEstado: Record<string, number> };
  sales: {
    porEstado: Record<string, number>;
    porPeriodo: { periodo: string; total: number }[];
  };
}

// Integración completa Lead → Client → Quote → PAID → Dashboard con DOS
// tenants, y la prueba de que NINGÚN vínculo puede cruzar de un proyecto a otro
// (ni por la API ni saltándose la aplicación, directo contra la base).
describe('Integration: Lead → Client → Quote → PAID → Dashboard, cross-tenant (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let a: Ids;
  let b: Ids;

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role = 'OWNER') =>
    ctx.cookie(seed.user(key, role));
  const url = (key: string) => `/api/v1/projects/${seed.project(key)}`;

  const post = async <T>(key: string, path: string, body: object) =>
    (
      await http()
        .post(`${url(key)}${path}`)
        .set('Cookie', as(key))
        .send(body)
        .expect(201)
    ).body as T;

  const move = (key: string, quoteId: string, status: string) =>
    http()
      .patch(`${url(key)}/quotes/${quoteId}/status`)
      .set('Cookie', as(key))
      .send({ status });

  const dashboard = async (key: string) =>
    (
      await http()
        .get(`${url(key)}/dashboard`)
        .set('Cookie', as(key))
        .expect(200)
    ).body as DashboardBody;

  // Cada tenant arranca con su propio lead, cliente, producto y cotización.
  async function seedTenant(key: string): Promise<Ids> {
    const product = await post<{ id: string }>(key, '/products', {
      name: `Producto ${key}`,
      price: 100,
    });
    const client = await post<{ id: string }>(key, '/clients', {
      name: `Cliente ${key}`,
    });
    const lead = await post<{ id: string }>(key, '/leads', {
      name: `Lead ${key}`,
    });
    const quote = await post<{ id: string }>(key, '/quotes', {
      leadId: lead.id,
      items: [{ productId: product.id, quantity: 1 }],
    });
    return {
      lead: lead.id,
      client: client.id,
      product: product.id,
      quote: quote.id,
    };
  }

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
      // Tenant aparte para el flujo feliz: sus cifras del Dashboard son exactas.
      { key: 'FLOW', members: { OWNER: 1 } },
      { key: 'OTHER', members: { OWNER: 1 } },
    ]);
    a = await seedTenant('A');
    b = await seedTenant('B');
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('happy path inside one tenant', () => {
    it('flows from lead to PAID and shows up in the Dashboard and client stats, without touching another tenant', async () => {
      const product = await post<{ id: string }>('FLOW', '/products', {
        name: 'Servicio',
        price: 100,
      });
      const lead = await post<{ id: string }>('FLOW', '/leads', {
        name: 'Lead flujo',
        estimatedValue: 5000,
      });

      // El pipeline cuenta el lead activo.
      const before = await dashboard('FLOW');
      expect(before.summary).toMatchObject({
        leadsActivos: 1,
        ganado: 0,
        pipeline: 5000,
      });

      // Lead → Client.
      const converted = await http()
        .post(`${url('FLOW')}/leads/${lead.id}/convert`)
        .set('Cookie', as('FLOW'))
        .send({})
        .expect(201);
      const client = (converted.body as { client: { id: string } }).client;

      // Client → Quote: sin clientId en el body hereda el del lead.
      const quote = await post<{ id: string; clientId: string; total: number }>(
        'FLOW',
        '/quotes',
        {
          leadId: lead.id,
          items: [{ productId: product.id, quantity: 3 }],
        },
      );
      expect(quote.clientId).toBe(client.id);
      expect(quote.total).toBe(336); // 300 + 12 % de IVA

      // Quote → PAID. Aceptarla mueve el lead a WON.
      for (const status of [
        'PENDING_APPROVAL',
        'APPROVED',
        'SENT',
        'ACCEPTED',
        'PAID',
      ]) {
        await move('FLOW', quote.id, status).expect(200);
      }

      // Client stats.
      const stats = (
        await http()
          .get(`${url('FLOW')}/clients/${client.id}/stats`)
          .set('Cookie', as('FLOW'))
          .expect(200)
      ).body as {
        quotesCount: number;
        paidQuotesCount: number;
        salesTotal: number;
      };
      expect(stats).toEqual({
        quotesCount: 1,
        paidQuotesCount: 1,
        salesTotal: 336,
        // Fecha del último movimiento del cliente (historial de actividad).
        lastActivityAt: expect.any(String) as string,
      });

      // Dashboard.
      const paidQuote = (
        await http()
          .get(`${url('FLOW')}/quotes/${quote.id}`)
          .set('Cookie', as('FLOW'))
          .expect(200)
      ).body as { paidAt: string };
      const month = paidQuote.paidAt.slice(0, 7);

      const after = await dashboard('FLOW');
      expect(after.summary).toMatchObject({
        leadsActivos: 0, // el lead ya es WON
        ganado: 1,
        pipeline: 0,
      });
      expect(after.quotes.porEstado.PAID).toBe(1);
      expect(after.sales.porEstado.PAID).toBe(336);
      expect(after.sales.porPeriodo).toEqual([{ periodo: month, total: 336 }]);

      // Otro tenant con cotización PAID propia no ve ni suma nada de FLOW.
      const other = await dashboard('OTHER');
      expect(other.quotes.porEstado.PAID).toBe(0);
      expect(other.sales.porPeriodo).toEqual([]);
      expect(other.summary.ganado).toBe(0);
    });
  });

  describe('API: nothing from tenant B can be linked into tenant A', () => {
    const asA = (method: 'post' | 'patch' | 'get' | 'delete', path: string) =>
      http()
        [method](`${url('A')}${path}`)
        .set('Cookie', as('A'));

    it('Lead A → Client B is refused (404) on create, update and convert', async () => {
      await asA('post', '/leads')
        .send({ name: 'Lead cruzado', clientId: b.client })
        .expect(404);
      await asA('patch', `/leads/${a.lead}`)
        .send({ clientId: b.client })
        .expect(404);
      await asA('post', `/leads/${a.lead}/convert`)
        .send({ clientId: b.client })
        .expect(404);

      const [row] = await ctx.db
        .select({ clientId: leads.clientId })
        .from(leads)
        .where(eq(leads.id, a.lead));
      expect(row.clientId).toBeNull();
    });

    it('Lead A → Product B (interest) is refused (404)', async () => {
      await asA('patch', `/leads/${a.lead}`)
        .send({ interestProductId: b.product })
        .expect(404);
    });

    it('Quote A → Lead B is refused (404)', async () => {
      await asA('post', '/quotes').send({ leadId: b.lead }).expect(404);
    });

    it('Quote A → Client B is refused (404) on create and edit', async () => {
      await asA('post', '/quotes')
        .send({ leadId: a.lead, clientId: b.client })
        .expect(404);
      await asA('patch', `/quotes/${a.quote}`)
        .send({ clientId: b.client })
        .expect(404);

      const [row] = await ctx.db
        .select({ clientId: quotes.clientId })
        .from(quotes)
        .where(eq(quotes.id, a.quote));
      expect(row.clientId).toBeNull();
    });

    it('Quote A → Product B is refused (404) on create and edit', async () => {
      await asA('post', '/quotes')
        .send({
          leadId: a.lead,
          items: [{ productId: b.product, quantity: 1 }],
        })
        .expect(404);
      await asA('patch', `/quotes/${a.quote}`)
        .send({ items: [{ productId: b.product, quantity: 1 }] })
        .expect(404);

      const items = await ctx.db
        .select({ productId: quoteItems.productId })
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, a.quote));
      expect(items.map((item) => item.productId)).toEqual([a.product]);
    });

    it('B resources are invisible and untouchable through A routes (404, nothing changes)', async () => {
      for (const path of [
        `/leads/${b.lead}`,
        `/clients/${b.client}`,
        `/clients/${b.client}/stats`,
        `/products/${b.product}`,
        `/quotes/${b.quote}`,
      ]) {
        await asA('get', path).expect(404);
      }

      await asA('patch', `/leads/${b.lead}`).send({ name: 'X' }).expect(404);
      await asA('patch', `/clients/${b.client}`)
        .send({ name: 'X' })
        .expect(404);
      await asA('patch', `/products/${b.product}`)
        .send({ name: 'X' })
        .expect(404);
      await asA('patch', `/quotes/${b.quote}`).send({ notes: 'X' }).expect(404);
      await asA('delete', `/quotes/${b.quote}`).expect(404);
      await asA('delete', `/clients/${b.client}`).expect(404);
      await asA('delete', `/leads/${b.lead}`).expect(404);
      await move('A', b.quote, 'PENDING_APPROVAL').expect(404);
      await asA('post', `/leads/${b.lead}/convert`).send({}).expect(404);

      const [quote] = await ctx.db
        .select({ status: quotes.status, notes: quotes.notes })
        .from(quotes)
        .where(eq(quotes.id, b.quote));
      expect(quote).toEqual({ status: 'DRAFT', notes: null });
      const [lead] = await ctx.db
        .select({ name: leads.name })
        .from(leads)
        .where(eq(leads.id, b.lead));
      expect(lead.name).toBe('Lead B');
    });

    it('B project routes answer 403 to a user of A, for every module', async () => {
      for (const [method, path] of [
        ['get', '/leads'],
        ['get', '/clients'],
        ['get', '/products'],
        ['get', '/quotes'],
        ['get', '/dashboard'],
        ['get', ''],
      ] as const) {
        await http()
          [method](`${url('B')}${path}`)
          .set('Cookie', as('A'))
          .expect(403);
      }
      await http()
        .post(`${url('B')}/quotes`)
        .set('Cookie', as('A'))
        .send({ leadId: b.lead })
        .expect(403);
    });

    it('lists never leak rows of another tenant', async () => {
      const ids = async (path: string) =>
        (
          (await asA('get', `${path}?limit=100`).expect(200)).body as {
            data: { id: string }[];
          }
        ).data.map((row) => row.id);

      expect(await ids('/leads')).not.toContain(b.lead);
      expect(await ids('/clients')).not.toContain(b.client);
      expect(await ids('/products')).not.toContain(b.product);
      expect(await ids('/quotes')).not.toContain(b.quote);
      // Y los de A sí están.
      expect(await ids('/quotes')).toContain(a.quote);
    });

    it('the Dashboard of A does not include the data of B', async () => {
      const [dashA, dashB] = [await dashboard('A'), await dashboard('B')];
      // Cada tenant tiene 1 lead activo y 1 cotización DRAFT propios.
      expect(dashA.summary.leadsActivos).toBe(1);
      expect(dashB.summary.leadsActivos).toBe(1);
      expect(dashA.quotes.porEstado.DRAFT).toBe(1);
      expect(dashB.quotes.porEstado.DRAFT).toBe(1);
    });
  });

  describe('database: composite FKs refuse cross-tenant links even bypassing the app', () => {
    const insertQuote = (values: Partial<typeof quotes.$inferInsert>) =>
      ctx.db.insert(quotes).values({
        projectId: seed.project('A'),
        leadId: a.lead,
        folio: `X-${randomUUID().slice(0, 8)}`,
        ...values,
      });

    it('quote of A → lead of B', async () => {
      await expect(insertQuote({ leadId: b.lead })).rejects.toThrow();
    });

    it('quote of A → client of B', async () => {
      await expect(insertQuote({ clientId: b.client })).rejects.toThrow();
    });

    it('quote item of A → product of B', async () => {
      await expect(
        ctx.db.insert(quoteItems).values({
          quoteId: a.quote,
          projectId: seed.project('A'),
          productId: b.product,
          description: 'Cruzado',
          quantity: 1,
          unitPrice: 1,
          lineTotal: 1,
          position: 99,
        }),
      ).rejects.toThrow();
    });

    it('quote item of A hanging from a quote of B', async () => {
      await expect(
        ctx.db.insert(quoteItems).values({
          quoteId: b.quote,
          projectId: seed.project('A'),
          productId: a.product,
          description: 'Cruzado',
          quantity: 1,
          unitPrice: 1,
          lineTotal: 1,
          position: 99,
        }),
      ).rejects.toThrow();
    });

    it('lead of A → client of B, and lead of A → product of B', async () => {
      await expect(
        ctx.db.insert(leads).values({
          projectId: seed.project('A'),
          name: 'Cruzado',
          clientId: b.client,
        }),
      ).rejects.toThrow();
      await expect(
        ctx.db.insert(leads).values({
          projectId: seed.project('A'),
          name: 'Cruzado',
          interestProductId: b.product,
        }),
      ).rejects.toThrow();
    });

    it('client of A → source lead of B', async () => {
      await expect(
        ctx.db.insert(clients).values({
          projectId: seed.project('A'),
          name: 'Cruzado',
          sourceLeadId: b.lead,
        }),
      ).rejects.toThrow();
    });

    it('updating an existing quote of A to point at B is refused too', async () => {
      await expect(
        ctx.db
          .update(quotes)
          .set({ clientId: b.client })
          .where(eq(quotes.id, a.quote)),
      ).rejects.toThrow();
      await expect(
        ctx.db
          .update(leads)
          .set({ clientId: b.client })
          .where(eq(leads.id, a.lead)),
      ).rejects.toThrow();
    });
  });
});
