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
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  approvedAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  createdByUserId: string | null;
  items: { lineTotal: number; position: number }[];
}

// Ciclo de vida (DRAFT → … → PAID/REJECTED), cálculo de importes, tope de
// descuento, folio correlativo, transición atómica y estadísticas de cliente.
describe('Quotes lifecycle (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let leadA: string;
  let leadB: string;
  let productA: string;
  // Producto con tope de descuento del 20 %.
  let productDiscount: string;

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role) => ctx.cookie(seed.user(key, role));
  const base = (key = 'A') => `/api/v1/projects/${seed.project(key)}`;

  const create = async (key: string, url: string, body: object) =>
    (
      await http()
        .post(`${base(key)}${url}`)
        .set('Cookie', as(key, 'OWNER'))
        .send(body)
        .expect(201)
    ).body as { id: string };

  const newQuote = async (body: object = {}, key = 'A', lead = leadA) =>
    (
      await http()
        .post(`${base(key)}/quotes`)
        .set('Cookie', as(key, 'OWNER'))
        .send({ leadId: lead, ...body })
        .expect(201)
    ).body as QuoteBody;

  const withItem = (quantity = 1) => ({
    items: [{ productId: productA, quantity }],
  });

  const move = (id: string, status: string, role: Role = 'OWNER', key = 'A') =>
    http()
      .patch(`${base(key)}/quotes/${id}/status`)
      .set('Cookie', as(key, role))
      .send({ status });

  const statusOf = async (id: string) =>
    (await ctx.db.select().from(quotes).where(eq(quotes.id, id)))[0]?.status;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
      { key: 'C', members: { OWNER: 1 } },
      { key: 'D', members: { OWNER: 1 } },
    ]);
    leadA = (await create('A', '/leads', { name: 'Lead A' })).id;
    leadB = (await create('B', '/leads', { name: 'Lead B' })).id;
    productA = (
      await create('A', '/products', { name: 'Servicio', price: 100 })
    ).id;
    productDiscount = (
      await create('A', '/products', {
        name: 'Licencia',
        price: 100,
        maxDiscountPercent: 20,
      })
    ).id;
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('happy path', () => {
    it('walks DRAFT → … → PAID filling each date and honoring permissions', async () => {
      const quote = await newQuote(withItem());
      expect(quote.status).toBe('DRAFT');
      expect(quote.createdByUserId).toBe(seed.user('A', 'OWNER'));

      // MEMBER pide la aprobación pero no puede aprobar.
      let body = (
        await move(quote.id, 'PENDING_APPROVAL', 'MEMBER').expect(200)
      ).body as QuoteBody;
      expect(body.status).toBe('PENDING_APPROVAL');
      await move(quote.id, 'APPROVED', 'MEMBER').expect(403);
      expect(await statusOf(quote.id)).toBe('PENDING_APPROVAL');

      body = (await move(quote.id, 'APPROVED').expect(200)).body as QuoteBody;
      expect(body.approvedAt).not.toBeNull();

      // Enviar y registrar la respuesta del cliente es trabajo de MEMBER.
      body = (await move(quote.id, 'SENT', 'MEMBER').expect(200))
        .body as QuoteBody;
      expect(body.sentAt).not.toBeNull();

      body = (await move(quote.id, 'ACCEPTED', 'MEMBER').expect(200))
        .body as QuoteBody;
      expect(body.acceptedAt).not.toBeNull();

      // Cobrar exige QUOTE_APPROVE.
      await move(quote.id, 'PAID', 'MEMBER').expect(403);
      body = (await move(quote.id, 'PAID').expect(200)).body as QuoteBody;
      expect(body.status).toBe('PAID');
      expect(body.paidAt).not.toBeNull();
      expect(body.rejectedAt).toBeNull();

      // PAID es terminal.
      await move(quote.id, 'APPROVED').expect(409);
    });

    it('ends in REJECTED, which is terminal', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'PENDING_APPROVAL').expect(200);
      await move(quote.id, 'APPROVED').expect(200);
      await move(quote.id, 'SENT').expect(200);

      const body = (await move(quote.id, 'REJECTED').expect(200))
        .body as QuoteBody;
      expect(body.rejectedAt).not.toBeNull();

      for (const target of ['DRAFT', 'SENT', 'ACCEPTED', 'PAID']) {
        await move(quote.id, target).expect(409);
      }
    });

    it('returns a PENDING_APPROVAL quote to DRAFT, where it can be edited again', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'PENDING_APPROVAL').expect(200);

      await http()
        .patch(`${base()}/quotes/${quote.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ notes: 'no todavía' })
        .expect(409);

      await move(quote.id, 'DRAFT').expect(200);
      await http()
        .patch(`${base()}/quotes/${quote.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ notes: 'ahora sí' })
        .expect(200);
    });
  });

  describe('lead stage follows the quote (B7)', () => {
    const stageOf = async (id: string) =>
      (
        (
          await http()
            .get(`${base()}/leads/${id}`)
            .set('Cookie', as('A', 'OWNER'))
            .expect(200)
        ).body as { stage: string }
      ).stage;

    const freshLead = async () =>
      (await create('A', '/leads', { name: 'Lead etapa' })).id;

    it('moves the lead to WON when its quote is ACCEPTED, and not before', async () => {
      const lead = await freshLead();
      const quote = await newQuote(withItem(), 'A', lead);

      for (const status of ['PENDING_APPROVAL', 'APPROVED', 'SENT']) {
        await move(quote.id, status).expect(200);
        expect(await stageOf(lead)).toBe('NEW');
      }

      await move(quote.id, 'ACCEPTED').expect(200);
      expect(await stageOf(lead)).toBe('WON');
    });

    it('leaves the lead untouched when the quote is REJECTED', async () => {
      const lead = await freshLead();
      const quote = await newQuote(withItem(), 'A', lead);
      for (const status of [
        'PENDING_APPROVAL',
        'APPROVED',
        'SENT',
        'REJECTED',
      ]) {
        await move(quote.id, status).expect(200);
      }

      expect(await stageOf(lead)).toBe('NEW');
    });

    it('does not touch the lead when a transition is refused', async () => {
      const lead = await freshLead();
      const quote = await newQuote(withItem(), 'A', lead);

      // DRAFT -> ACCEPTED no es una transición válida.
      await move(quote.id, 'ACCEPTED').expect(409);
      expect(await stageOf(lead)).toBe('NEW');
    });
  });

  describe('invalid transitions', () => {
    it.each([
      ['DRAFT', 'APPROVED'],
      ['DRAFT', 'SENT'],
      ['DRAFT', 'PAID'],
      ['DRAFT', 'DRAFT'],
    ])('rejects %s → %s with 409', async (_from, to) => {
      const quote = await newQuote(withItem());
      await move(quote.id, to).expect(409);
      expect(await statusOf(quote.id)).toBe('DRAFT');
    });

    it('rejects skipping steps further down the cycle', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'PENDING_APPROVAL').expect(200);
      await move(quote.id, 'APPROVED').expect(200);

      await move(quote.id, 'DRAFT').expect(409);
      await move(quote.id, 'ACCEPTED').expect(409);
      await move(quote.id, 'PAID').expect(409);
      await move(quote.id, 'REJECTED').expect(409);
      expect(await statusOf(quote.id)).toBe('APPROVED');
    });

    it('rejects an unknown status with 400', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'WHATEVER').expect(400);
    });

    it('does not allow requesting approval for a quote without items', async () => {
      const quote = await newQuote();
      await move(quote.id, 'PENDING_APPROVAL').expect(409);
    });

    it('forbids edit and delete once the quote left DRAFT', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'PENDING_APPROVAL').expect(200);

      await http()
        .delete(`${base()}/quotes/${quote.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(409);
      expect(await statusOf(quote.id)).toBe('PENDING_APPROVAL');
    });
  });

  describe('permissions and tenant isolation', () => {
    it('forbids VIEWER from changing the status', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'PENDING_APPROVAL', 'VIEWER').expect(403);
      expect(await statusOf(quote.id)).toBe('DRAFT');
    });

    it('returns 404 and writes nothing for a quote of another tenant', async () => {
      const target = await newQuote({}, 'B', leadB);

      await move(target.id, 'PENDING_APPROVAL', 'OWNER', 'A').expect(404);
      expect(await statusOf(target.id)).toBe('DRAFT');
    });
  });

  describe('totals', () => {
    it('computes subtotal, discount, tax and total on the server', async () => {
      const quote = await newQuote({
        items: [
          { productId: productDiscount, quantity: 3, discountPercent: 10 },
          { productId: productA, quantity: 1.5 },
        ],
      });

      // Línea 1: 300 - 30 = 270. Línea 2: 150. Bruto 450, descuento 30,
      // base 420, IVA 12 % = 50.40, total 470.40.
      expect(quote.subtotal).toBe(450);
      expect(quote.discount).toBe(30);
      expect(quote.tax).toBe(50.4);
      expect(quote.total).toBe(470.4);
      expect(quote.items.map((item) => item.lineTotal)).toEqual([270, 150]);
      expect(quote.items.map((item) => item.position)).toEqual([1, 2]);
      expect(quote.total).toBeCloseTo(
        quote.subtotal - quote.discount + quote.tax,
        2,
      );
    });

    it('recalculates when the items are replaced', async () => {
      const quote = await newQuote(withItem(10));
      const edited = (
        await http()
          .patch(`${base()}/quotes/${quote.id}`)
          .set('Cookie', as('A', 'OWNER'))
          .send(withItem(1))
          .expect(200)
      ).body as QuoteBody;

      expect(edited.subtotal).toBe(100);
      expect(edited.total).toBe(112);
    });

    it('applies the commercial adjustment before tax and rejects one above the base', async () => {
      // Bruto 1000, ajuste 50 → base 950, IVA 12 % = 114, total 1064.
      const quote = (await newQuote({
        ...withItem(10),
        adjustment: 50,
      })) as QuoteBody & { adjustment: number; taxPercent: number };
      expect(quote.adjustment).toBe(50);
      expect(quote.taxPercent).toBe(12);
      expect(quote.tax).toBe(114);
      expect(quote.total).toBe(1064);

      // Cambiar solo el ajuste recalcula sin tocar las partidas.
      const edited = (
        await http()
          .patch(`${base()}/quotes/${quote.id}`)
          .set('Cookie', as('A', 'OWNER'))
          .send({ adjustment: 100 })
          .expect(200)
      ).body as QuoteBody & { adjustment: number };
      expect(edited.adjustment).toBe(100);
      expect(edited.total).toBe(1008);
      expect(edited.items).toHaveLength(1);

      await http()
        .patch(`${base()}/quotes/${quote.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ adjustment: 1000.01 })
        .expect(400);
    });

    it('takes the price from the catalog even if the product price changes later', async () => {
      const quote = await newQuote(withItem(1));
      await http()
        .patch(`${base()}/products/${productA}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ price: 999 })
        .expect(200);

      // La cotización ya creada conserva el precio con el que se cotizó.
      const detail = (
        await http()
          .get(`${base()}/quotes/${quote.id}`)
          .set('Cookie', as('A', 'OWNER'))
          .expect(200)
      ).body as QuoteBody;
      expect(detail.subtotal).toBe(100);

      await http()
        .patch(`${base()}/products/${productA}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ price: 100 })
        .expect(200);
    });

    it('caps the discount at the product maximum with 400', async () => {
      const response = await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({
          leadId: leadA,
          items: [
            { productId: productDiscount, quantity: 1, discountPercent: 20.01 },
          ],
        })
        .expect(400);
      expect(JSON.stringify(response.body)).toContain('maximum');

      // El tope exacto sí se permite.
      await newQuote({
        items: [
          { productId: productDiscount, quantity: 1, discountPercent: 20 },
        ],
      });

      // Un producto sin descuento permitido (máximo 0) no admite ninguno.
      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({
          leadId: leadA,
          items: [{ productId: productA, quantity: 1, discountPercent: 1 }],
        })
        .expect(400);
    });

    it('does not quote an inactive product', async () => {
      const inactive = (
        await create('A', '/products', { name: 'Descontinuado', price: 5 })
      ).id;
      await http()
        .patch(`${base()}/products/${inactive}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ active: false })
        .expect(200);

      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({
          leadId: leadA,
          items: [{ productId: inactive, quantity: 1 }],
        })
        .expect(409);
    });
  });

  describe('folio', () => {
    it('is consecutive per project and independent between projects', async () => {
      const leadC = (await create('C', '/leads', { name: 'Lead C' })).id;
      const leadD = (await create('D', '/leads', { name: 'Lead D' })).id;

      const c1 = await newQuote({}, 'C', leadC);
      const c2 = await newQuote({}, 'C', leadC);
      const c3 = await newQuote({}, 'C', leadC);
      const d1 = await newQuote({}, 'D', leadD);

      expect([c1.folio, c2.folio, c3.folio]).toEqual([
        'COT-000001',
        'COT-000002',
        'COT-000003',
      ]);
      expect(d1.folio).toBe('COT-000001');
    });

    it('never repeats under concurrent creation', async () => {
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          http()
            .post(`${base()}/quotes`)
            .set('Cookie', as('A', 'OWNER'))
            .send({ leadId: leadA }),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual(
        Array(8).fill(201),
      );
      const folios = responses.map(
        (response) => (response.body as QuoteBody).folio,
      );
      expect(new Set(folios).size).toBe(8);
    });
  });

  describe('atomic transition', () => {
    it('lets exactly one of several concurrent approvals win', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'PENDING_APPROVAL').expect(200);

      const responses = await Promise.all(
        Array.from({ length: 6 }, () => move(quote.id, 'APPROVED')),
      );
      const statuses = responses.map((response) => response.status).sort();

      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(5);
      expect(await statusOf(quote.id)).toBe('APPROVED');
    });

    it('refuses an edit racing an approval without corrupting the quote', async () => {
      const quote = await newQuote(withItem());
      await move(quote.id, 'PENDING_APPROVAL').expect(200);

      // La edición solo aplica a DRAFT: contra una cotización pendiente jamás
      // debe pisar el estado ni los importes.
      const [edit, approve] = await Promise.all([
        http()
          .patch(`${base()}/quotes/${quote.id}`)
          .set('Cookie', as('A', 'OWNER'))
          .send(withItem(50)),
        move(quote.id, 'APPROVED'),
      ]);

      expect(edit.status).toBe(409);
      expect(approve.status).toBe(200);
      const [row] = await ctx.db
        .select()
        .from(quotes)
        .where(eq(quotes.id, quote.id));
      expect(row.status).toBe('APPROVED');
      expect(row.subtotal).toBe(100);
    });
  });

  describe('client stats', () => {
    it('counts quotes and sums only the PAID ones', async () => {
      const client = await create('A', '/clients', { name: 'Cliente Stats' });
      const lead = (await create('A', '/leads', { name: 'Lead Stats' })).id;
      const other = (await create('A', '/clients', { name: 'Sin cotizar' })).id;

      const paid = await newQuote(
        { clientId: client.id, ...withItem(2) },
        'A',
        lead,
      );
      await newQuote({ clientId: client.id, ...withItem(5) }, 'A', lead);
      for (const status of [
        'PENDING_APPROVAL',
        'APPROVED',
        'SENT',
        'ACCEPTED',
        'PAID',
      ]) {
        await move(paid.id, status).expect(200);
      }

      const stats = (
        await http()
          .get(`${base()}/clients/${client.id}/stats`)
          .set('Cookie', as('A', 'VIEWER'))
          .expect(200)
      ).body as {
        quotesCount: number;
        paidQuotesCount: number;
        salesTotal: number;
      };
      // Pagada: 2 x 100 + 12 % = 224. La otra no suma.
      expect(stats).toEqual({
        quotesCount: 2,
        paidQuotesCount: 1,
        salesTotal: 224,
        // Fecha del último movimiento del cliente (historial de actividad).
        lastActivityAt: expect.any(String) as string,
      });

      expect(
        (
          await http()
            .get(`${base()}/clients/${other}/stats`)
            .set('Cookie', as('A', 'OWNER'))
            .expect(200)
        ).body,
      ).toEqual({
        quotesCount: 0,
        paidQuotesCount: 0,
        salesTotal: 0,
        // Aun sin cotizaciones, el cliente tiene actividad (su creación).
        lastActivityAt: expect.any(String) as string,
      });
    });

    it('returns 404 for a client of another tenant', async () => {
      const foreign = await create('B', '/clients', { name: 'Cliente de B' });

      await http()
        .get(`${base()}/clients/${foreign.id}/stats`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(404);
    });

    it('keeps a client with quotes from being deleted', async () => {
      const client = await create('A', '/clients', { name: 'Con cotización' });
      await newQuote({ clientId: client.id });

      await http()
        .delete(`${base()}/clients/${client.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(409);
    });
  });
});
