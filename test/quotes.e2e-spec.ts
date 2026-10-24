import { eq } from 'drizzle-orm';
import request from 'supertest';
import { quotes } from '../src/db/schema';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

interface QuoteBody {
  id: string;
  status: string;
  folio: string;
  total: number;
  leadId: string;
  lead: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  items: { productId: string; unitPrice: number; lineTotal: number }[];
}

interface ListBody {
  data: QuoteBody[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// CRUD, listado (filtros, orden, paginación) y aislamiento entre tenants. El
// ciclo de vida y los cálculos están en quotes-lifecycle.e2e-spec.ts.
describe('Quotes (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let leadA: string;
  let leadB: string;
  let productA: string;
  let productB: string;
  let clientA: string;

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role) => ctx.cookie(seed.user(key, role));
  const base = (key = 'A') => `/api/v1/projects/${seed.project(key)}`;

  const post = async (url: string, key: string, body: object, role: Role) =>
    (
      await http()
        .post(`${base(key)}${url}`)
        .set('Cookie', as(key, role))
        .send(body)
        .expect(201)
    ).body as { id: string };

  const createQuote = async (body: object, key = 'A', role: Role = 'OWNER') =>
    (
      await http()
        .post(`${base(key)}/quotes`)
        .set('Cookie', as(key, role))
        .send(body)
        .expect(201)
    ).body as QuoteBody;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
    leadA = (await post('/leads', 'A', { name: 'Lead A' }, 'OWNER')).id;
    leadB = (await post('/leads', 'B', { name: 'Lead B' }, 'OWNER')).id;
    clientA = (await post('/clients', 'A', { name: 'Cliente A' }, 'OWNER')).id;
    productA = (
      await post(
        '/products',
        'A',
        { name: 'Licencia', price: 500, maxDiscountPercent: 10 },
        'OWNER',
      )
    ).id;
    productB = (
      await post('/products', 'B', { name: 'Producto B', price: 10 }, 'OWNER')
    ).id;
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('create', () => {
    it('creates a DRAFT with catalog price, lead summary and a folio', async () => {
      const quote = await createQuote({
        leadId: leadA,
        clientId: clientA,
        items: [{ productId: productA, quantity: 2 }],
      });

      expect(quote.status).toBe('DRAFT');
      expect(quote.folio).toMatch(/^COT-\d{6}$/);
      expect(quote.lead).toEqual({ id: leadA, name: 'Lead A' });
      expect(quote.client).toEqual({ id: clientA, name: 'Cliente A' });
      expect(quote.items).toHaveLength(1);
      expect(quote.items[0]).toMatchObject({
        productId: productA,
        unitPrice: 500,
        lineTotal: 1000,
      });
    });

    it('rejects client-supplied folio, status, total and prices', async () => {
      for (const extra of [
        { folio: 'MINE' },
        { status: 'APPROVED' },
        { total: 1 },
        { subtotal: 1, tax: 1 },
      ]) {
        await http()
          .post(`${base()}/quotes`)
          .set('Cookie', as('A', 'OWNER'))
          .send({ leadId: leadA, ...extra })
          .expect(400);
      }

      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({
          leadId: leadA,
          items: [{ productId: productA, quantity: 1, unitPrice: 1 }],
        })
        .expect(400);
    });

    it('refuses a lead, client or product of another project with 404', async () => {
      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ leadId: leadB })
        .expect(404);

      await http()
        .post(`${base('B')}/quotes`)
        .set('Cookie', as('B', 'OWNER'))
        .send({ leadId: leadB, clientId: clientA })
        .expect(404);

      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({
          leadId: leadA,
          items: [{ productId: productB, quantity: 1 }],
        })
        .expect(404);
    });

    it('forbids VIEWER from creating quotes', async () => {
      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'VIEWER'))
        .send({ leadId: leadA })
        .expect(403);
    });

    it('rejects a quantity of zero or a discount above 100', async () => {
      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ leadId: leadA, items: [{ productId: productA, quantity: 0 }] })
        .expect(400);

      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({
          leadId: leadA,
          items: [{ productId: productA, quantity: 1, discountPercent: 101 }],
        })
        .expect(400);
    });
  });

  describe('list', () => {
    let q1: QuoteBody;
    let q2: QuoteBody;
    let q3: QuoteBody;

    beforeAll(async () => {
      q1 = await createQuote({
        leadId: leadA,
        items: [{ productId: productA, quantity: 1 }],
      });
      q2 = await createQuote({
        leadId: leadA,
        clientId: clientA,
        items: [{ productId: productA, quantity: 5 }],
      });
      q3 = await createQuote({
        leadId: leadA,
        items: [{ productId: productA, quantity: 3 }],
      });
    });

    // Siempre como VIEWER del tenant A: leer solo exige QUOTE_READ.
    const list = async (query: string) =>
      (
        await http()
          .get(`${base()}/quotes?${query}`)
          .set('Cookie', as('A', 'VIEWER'))
          .expect(200)
      ).body as ListBody;

    it('includes lead and client summaries, readable by VIEWER', async () => {
      const body = await list('limit=100');
      const row = body.data.find((quote) => quote.id === q2.id);
      expect(row?.lead).toEqual({ id: leadA, name: 'Lead A' });
      expect(row?.client).toEqual({ id: clientA, name: 'Cliente A' });
    });

    it('searches by folio', async () => {
      const body = await list(`search=${q1.folio}`);
      expect(body.data.map((quote) => quote.id)).toEqual([q1.id]);
    });

    it('treats LIKE wildcards in the search literally', async () => {
      const body = await list('search=%25');
      expect(body.data).toEqual([]);
    });

    it('filters by clientId, leadId and status', async () => {
      const byClient = (await list(`clientId=${clientA}`)).data;
      expect(byClient.map((quote) => quote.id)).toContain(q2.id);
      expect(byClient.every((quote) => quote.client?.id === clientA)).toBe(
        true,
      );
      expect(byClient.map((quote) => quote.id)).not.toContain(q1.id);
      expect((await list(`leadId=${leadA}&limit=100`)).meta.total).toBe(
        (await list('limit=100')).meta.total,
      );
      expect((await list('status=APPROVED')).data).toEqual([]);
    });

    it('filters by creation date range', async () => {
      expect((await list('createdFrom=2999-01-01T00:00:00Z')).data).toEqual([]);
      expect((await list('createdTo=2000-01-01T00:00:00Z')).meta.total).toBe(0);
      expect(
        (await list('createdFrom=2000-01-01T00:00:00Z')).meta.total,
      ).toBeGreaterThanOrEqual(3);
    });

    it('sorts by total and by folio in both directions', async () => {
      const byTotalDesc = (await list('sortBy=total&order=desc&limit=100'))
        .data;
      const totals = byTotalDesc.map((quote) => quote.total);
      expect(totals).toEqual([...totals].sort((a, b) => b - a));

      const byFolioAsc = (await list('sortBy=folio&order=asc&limit=100')).data;
      const folios = byFolioAsc.map((quote) => quote.folio);
      expect(folios).toEqual([...folios].sort());
      expect(folios).toEqual(expect.arrayContaining([q1.folio, q3.folio]));
    });

    it('rejects an unknown sort field', async () => {
      await http()
        .get(`${base()}/quotes?sortBy=password`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(400);
    });

    it('paginates with distinct rows per page', async () => {
      const first = await list('page=1&limit=2');
      const second = await list('page=2&limit=2');
      expect(first.data).toHaveLength(2);
      expect(first.meta.total).toBeGreaterThanOrEqual(3);
      expect(first.meta.totalPages).toBe(Math.ceil(first.meta.total / 2));
      const firstIds = new Set(first.data.map((quote) => quote.id));
      expect(second.data.some((quote) => firstIds.has(quote.id))).toBe(false);
    });

    it('never leaks quotes across tenants', async () => {
      const foreign = await createQuote({ leadId: leadB }, 'B');

      const own = await list('limit=100');
      expect(own.data.some((quote) => quote.id === foreign.id)).toBe(false);

      // El filtro por un lead de otro tenant no amplía el alcance.
      expect((await list(`leadId=${leadB}`)).data).toEqual([]);

      await http()
        .get(`${base()}/quotes/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);
    });
  });

  describe('detail, edit and delete', () => {
    it('returns the detail with its items', async () => {
      const created = await createQuote({
        leadId: leadA,
        items: [{ productId: productA, quantity: 4, description: 'Custom' }],
      });

      const detail = (
        await http()
          .get(`${base()}/quotes/${created.id}`)
          .set('Cookie', as('A', 'VIEWER'))
          .expect(200)
      ).body as QuoteBody & { items: { description: string }[] };

      expect(detail.items).toHaveLength(1);
      expect(detail.items[0].description).toBe('Custom');
    });

    it('edits a DRAFT and replaces its items', async () => {
      const created = await createQuote({
        leadId: leadA,
        items: [{ productId: productA, quantity: 1 }],
      });

      const edited = (
        await http()
          .patch(`${base()}/quotes/${created.id}`)
          .set('Cookie', as('A', 'MEMBER'))
          .send({
            notes: 'Actualizada',
            items: [{ productId: productA, quantity: 2 }],
          })
          .expect(200)
      ).body as QuoteBody;

      expect(edited.items).toHaveLength(1);
      expect(edited.items[0].lineTotal).toBe(1000);
      // 1000 + 12 % de IVA
      expect(edited.total).toBe(1120);
    });

    it('forbids VIEWER from editing and deleting', async () => {
      const created = await createQuote({ leadId: leadA });

      await http()
        .patch(`${base()}/quotes/${created.id}`)
        .set('Cookie', as('A', 'VIEWER'))
        .send({ notes: 'x' })
        .expect(403);
      await http()
        .delete(`${base()}/quotes/${created.id}`)
        .set('Cookie', as('A', 'VIEWER'))
        .expect(403);
    });

    it('returns 404 when editing or deleting a quote of another tenant', async () => {
      const foreign = await createQuote({ leadId: leadB }, 'B');

      await http()
        .patch(`${base()}/quotes/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ notes: 'x' })
        .expect(404);
      await http()
        .delete(`${base()}/quotes/${foreign.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);

      const rows = await ctx.db
        .select({ id: quotes.id })
        .from(quotes)
        .where(eq(quotes.id, foreign.id));
      expect(rows).toHaveLength(1);
    });

    it('deletes a DRAFT together with its items', async () => {
      const created = await createQuote({
        leadId: leadA,
        items: [{ productId: productA, quantity: 1 }],
      });

      await http()
        .delete(`${base()}/quotes/${created.id}`)
        .set('Cookie', as('A', 'MEMBER'))
        .expect(204);
      await http()
        .get(`${base()}/quotes/${created.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);
    });
  });

  describe('cascade', () => {
    it('deletes quotes when their lead is deleted', async () => {
      const lead = await post('/leads', 'A', { name: 'Cascade lead' }, 'OWNER');
      const quote = await createQuote({
        leadId: lead.id,
        items: [{ productId: productA, quantity: 1 }],
      });

      await http()
        .delete(`${base()}/leads/${lead.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(204);

      const rows = await ctx.db
        .select({ id: quotes.id })
        .from(quotes)
        .where(eq(quotes.id, quote.id));
      expect(rows).toHaveLength(0);
    });
  });
});
