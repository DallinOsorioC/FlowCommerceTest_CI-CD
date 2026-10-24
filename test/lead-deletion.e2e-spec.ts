import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { leads, messages, quotes } from '../src/db/schema';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

// Borrar un lead no puede destruir historial comercial: ni cotizaciones fuera
// de DRAFT ni mensajes (registro de auditoría). Los borradores sí caen con él.
describe('Lead deletion protects commercial history (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let productId: string;

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role) => ctx.cookie(seed.user(key, role));
  const base = (key = 'A') => `/api/v1/projects/${seed.project(key)}`;

  const newLead = async (key = 'A') =>
    (
      await http()
        .post(`${base(key)}/leads`)
        .set('Cookie', as(key, 'OWNER'))
        .send({ name: `Lead ${randomUUID().slice(0, 6)}` })
        .expect(201)
    ).body as { id: string };

  const newQuote = async (leadId: string) =>
    (
      await http()
        .post(`${base()}/quotes`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ leadId, items: [{ productId, quantity: 1 }] })
        .expect(201)
    ).body as { id: string };

  const moveTo = async (quoteId: string, path: string[]) => {
    for (const status of path) {
      await http()
        .patch(`${base()}/quotes/${quoteId}/status`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ status })
        .expect(200);
    }
  };

  const del = (leadId: string, role: Role = 'OWNER', key = 'A') =>
    http()
      .delete(`${base(key)}/leads/${leadId}`)
      .set('Cookie', as(key, role));

  const leadExists = async (id: string) =>
    (await ctx.db.select({ id: leads.id }).from(leads).where(eq(leads.id, id)))
      .length === 1;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
    const product = (
      await http()
        .post(`${base()}/products`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ name: 'Servicio', price: 100 })
        .expect(201)
    ).body as { id: string };
    productId = product.id;
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  it('deletes a lead without history', async () => {
    const lead = await newLead();
    await del(lead.id).expect(204);
    expect(await leadExists(lead.id)).toBe(false);
  });

  it('deletes a lead together with its DRAFT quotes', async () => {
    const lead = await newLead();
    const draft = await newQuote(lead.id);

    await del(lead.id).expect(204);

    expect(await leadExists(lead.id)).toBe(false);
    const rows = await ctx.db
      .select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.id, draft.id));
    expect(rows).toHaveLength(0);
  });

  it.each([
    ['PENDING_APPROVAL', ['PENDING_APPROVAL']],
    ['SENT', ['PENDING_APPROVAL', 'APPROVED', 'SENT']],
    ['ACCEPTED', ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED']],
    ['PAID', ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'PAID']],
    ['REJECTED', ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED']],
  ])(
    'refuses with 409 a lead with a %s quote and keeps everything',
    async (_s, path) => {
      const lead = await newLead();
      const draft = await newQuote(lead.id);
      const advanced = await newQuote(lead.id);
      await moveTo(advanced.id, path);

      await del(lead.id).expect(409);

      expect(await leadExists(lead.id)).toBe(true);
      const kept = await ctx.db
        .select({ id: quotes.id })
        .from(quotes)
        .where(eq(quotes.leadId, lead.id));
      expect(kept.map((row) => row.id).sort()).toEqual(
        [draft.id, advanced.id].sort(),
      );
    },
  );

  it('refuses with 409 a lead that has messages', async () => {
    const lead = await newLead();
    await ctx.db.insert(messages).values({
      projectId: seed.project('A'),
      leadId: lead.id,
      whatsappMessageId: `wamid.${randomUUID()}`,
      direction: 'INBOUND',
      content: 'Hola',
    });

    await del(lead.id).expect(409);

    expect(await leadExists(lead.id)).toBe(true);
    const kept = await ctx.db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.leadId, lead.id));
    expect(kept).toHaveLength(1);
  });

  it('keeps the lead protected after moving it to LOST (LOST is the way out of the funnel)', async () => {
    const lead = await newLead();
    const quote = await newQuote(lead.id);
    await moveTo(quote.id, ['PENDING_APPROVAL', 'APPROVED', 'SENT']);

    // La salida del embudo es la etapa LOST, no el borrado.
    await http()
      .patch(`${base()}/leads/${lead.id}`)
      .set('Cookie', as('A', 'OWNER'))
      .send({ stage: 'LOST' })
      .expect(200);
    await del(lead.id).expect(409);
  });

  it('keeps 404 for a missing or foreign lead and 403 for MEMBER', async () => {
    const foreign = await newLead('B');

    await del(foreign.id).expect(404);
    await del(randomUUID()).expect(404);
    expect(await leadExists(foreign.id)).toBe(true);

    const own = await newLead();
    await del(own.id, 'MEMBER').expect(403);
    expect(await leadExists(own.id)).toBe(true);
  });
});
