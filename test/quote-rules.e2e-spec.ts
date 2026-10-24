import { eq } from 'drizzle-orm';
import request from 'supertest';
import { quotes } from '../src/db/schema';
import {
  createE2eApp,
  type E2eContext,
  type SeededTenants,
} from './support/e2e-app';

// Reglas de negocio de cotizaciones añadidas tras la auditoría:
//   B6 folio que no choca con cotizaciones antiguas,
//   B8 vigencia (validUntil),
//   P1 revalidar partidas contra el catálogo al pedir aprobación,
//   C4 cliente desactivado.
describe('Quote rules (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let leadId: string;
  let productId: string;

  const http = () => request(ctx.app.getHttpServer());
  const owner = () => ctx.cookie(seed.user('A', 'OWNER'));
  const base = () => `/api/v1/projects/${seed.project('A')}`;
  const post = (url: string, body: object) =>
    http().post(`${base()}${url}`).set('Cookie', owner()).send(body);
  const patch = (url: string, body: object) =>
    http().patch(`${base()}${url}`).set('Cookie', owner()).send(body);
  const day = 86_400_000;

  const newDraft = async (extra: object = {}) =>
    (
      await post('/quotes', {
        leadId,
        items: [{ productId, quantity: 1 }],
        ...extra,
      }).expect(201)
    ).body as { id: string; folio: string };

  const moveTo = (id: string, ...statuses: string[]) =>
    statuses.reduce<Promise<unknown>>(
      (prev, status) =>
        prev.then(() => patch(`/quotes/${id}/status`, { status }).expect(200)),
      Promise.resolve(),
    );

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([{ key: 'A', members: { OWNER: 1 } }]);
    leadId = (
      (await post('/leads', { name: 'Lead' }).expect(201)).body as {
        id: string;
      }
    ).id;
    productId = (
      (
        await post('/products', {
          name: 'Servicio',
          price: 100,
          maxDiscountPercent: 20,
        }).expect(201)
      ).body as { id: string }
    ).id;
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('B6: folio', () => {
    it('skips a folio already used by an old quote instead of failing with 500', async () => {
      const first = await newDraft();
      const next = Number(first.folio.split('-')[1]) + 1;
      const taken = `COT-${String(next).padStart(6, '0')}`;
      // Cotización "antigua" que ya ocupa el siguiente folio.
      await ctx.db.insert(quotes).values({
        projectId: seed.project('A'),
        leadId,
        folio: taken,
        subtotal: 0,
        tax: 0,
        total: 0,
      });

      const created = await newDraft();
      expect(created.folio).toBe(`COT-${String(next + 1).padStart(6, '0')}`);
    });
  });

  describe('B8: validity', () => {
    it('rejects a validUntil in the past (400) and accepts null', async () => {
      await post('/quotes', {
        leadId,
        validUntil: new Date(Date.now() - day).toISOString(),
      }).expect(400);
      const open = await post('/quotes', { leadId, validUntil: null }).expect(
        201,
      );
      expect(
        (open.body as { validUntil: string | null }).validUntil,
      ).toBeNull();
    });

    it('refuses to accept an expired quote (409) and keeps it SENT', async () => {
      const quote = await newDraft();
      await moveTo(quote.id, 'PENDING_APPROVAL', 'APPROVED', 'SENT');
      await ctx.db
        .update(quotes)
        .set({ validUntil: new Date(Date.now() - day) })
        .where(eq(quotes.id, quote.id));

      await patch(`/quotes/${quote.id}/status`, { status: 'ACCEPTED' }).expect(
        409,
      );
      const [row] = await ctx.db
        .select()
        .from(quotes)
        .where(eq(quotes.id, quote.id));
      expect(row.status).toBe('SENT');
    });
  });

  describe('P1: items revalidated on approval request', () => {
    it('answers 409 when the product was deactivated after drafting', async () => {
      const product = (
        (await post('/products', { name: 'Temporal', price: 50 }).expect(201))
          .body as { id: string }
      ).id;
      const quote = (
        (
          await post('/quotes', {
            leadId,
            items: [{ productId: product, quantity: 1 }],
          }).expect(201)
        ).body as { id: string }
      ).id;
      await patch(`/products/${product}`, { active: false }).expect(200);

      await patch(`/quotes/${quote}/status`, {
        status: 'PENDING_APPROVAL',
      }).expect(409);
    });

    it('answers 409 when the price changed after drafting', async () => {
      const product = (
        (await post('/products', { name: 'Variable', price: 80 }).expect(201))
          .body as { id: string }
      ).id;
      const quote = (
        (
          await post('/quotes', {
            leadId,
            items: [{ productId: product, quantity: 1 }],
          }).expect(201)
        ).body as { id: string }
      ).id;
      await patch(`/products/${product}`, { price: 90 }).expect(200);

      await patch(`/quotes/${quote}/status`, {
        status: 'PENDING_APPROVAL',
      }).expect(409);
      // Al volver a guardar las partidas toma el precio nuevo y ya se puede.
      await patch(`/quotes/${quote}`, {
        items: [{ productId: product, quantity: 1 }],
      }).expect(200);
      await patch(`/quotes/${quote}/status`, {
        status: 'PENDING_APPROVAL',
      }).expect(200);
    });
  });

  describe('C4: inactive client', () => {
    it('refuses new quotes for an inactive client (409)', async () => {
      const client = (
        (await post('/clients', { name: 'Cliente inactivo' }).expect(201))
          .body as { id: string }
      ).id;
      await patch(`/clients/${client}`, { active: false }).expect(200);

      await post('/quotes', { leadId, clientId: client }).expect(409);
    });
  });
});
