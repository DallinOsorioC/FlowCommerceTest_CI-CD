import { eq } from 'drizzle-orm';
import request from 'supertest';
import { clients } from '../src/db/schema';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

interface LeadBody {
  id: string;
  name: string;
  stage: string;
  company: string | null;
  source: string | null;
  estimatedValue: number | null;
  assignedUserId: string | null;
  assignedUser: { id: string; name: string } | null;
  clientId: string | null;
  client: { id: string; name: string } | null;
  interestProductId: string | null;
  interestProduct: { id: string; name: string } | null;
  lastContactAt: string | null;
}

// Campos de pipeline de leads (responsable, valor, fuente, empresa, producto
// de interés), filtros y orden, y la conversión Lead → Client.
describe('Leads pipeline & conversion (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let productA: string;
  let productB: string;
  let clientB: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);

    productA = (
      (
        await http()
          .post(`/api/v1/projects/${seed.project('A')}/products`)
          .set('Cookie', as('A', 'OWNER'))
          .send({ name: 'Sistema de gestión de obra', price: 15000 })
          .expect(201)
      ).body as { id: string }
    ).id;
    productB = (
      (
        await http()
          .post(`/api/v1/projects/${seed.project('B')}/products`)
          .set('Cookie', as('B', 'OWNER'))
          .send({ name: 'Producto de B', price: 1 })
          .expect(201)
      ).body as { id: string }
    ).id;
    clientB = (
      (
        await http()
          .post(`/api/v1/projects/${seed.project('B')}/clients`)
          .set('Cookie', as('B', 'OWNER'))
          .send({ name: 'Cliente de B' })
          .expect(201)
      ).body as { id: string }
    ).id;
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  function http() {
    return request(ctx.app.getHttpServer());
  }
  function as(key: string, role: Role) {
    return ctx.cookie(seed.user(key, role));
  }
  const leadsUrl = (key = 'A') => `/api/v1/projects/${seed.project(key)}/leads`;

  const createLead = async (body: Record<string, unknown>) =>
    (
      await http()
        .post(leadsUrl())
        .set('Cookie', as('A', 'MEMBER'))
        .send(body)
        .expect(201)
    ).body as LeadBody;

  describe('pipeline fields', () => {
    it('stores responsible, value, source, company, product and last contact', async () => {
      const lead = await createLead({
        name: 'Andrea López',
        company: 'Constructora Nova',
        source: 'REFERRAL',
        stage: 'NEGOTIATION',
        estimatedValue: 28900,
        notes: 'Necesita integración con su ERP',
        assignedUserId: seed.user('A', 'MEMBER'),
        interestProductId: productA,
        lastContactAt: '2026-09-11T15:12:00.000Z',
      });

      expect(lead).toMatchObject({
        company: 'Constructora Nova',
        source: 'REFERRAL',
        stage: 'NEGOTIATION',
        estimatedValue: 28900,
        assignedUserId: seed.user('A', 'MEMBER'),
        interestProductId: productA,
        lastContactAt: '2026-09-11T15:12:00.000Z',
      });
      expect(lead.assignedUser?.id).toBe(seed.user('A', 'MEMBER'));
      expect(lead.interestProduct?.name).toBe('Sistema de gestión de obra');
    });

    it('rejects a responsible user from another project (400)', async () => {
      await http()
        .post(leadsUrl())
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: 'X', assignedUserId: seed.user('B', 'OWNER') })
        .expect(400);
    });

    it('rejects a client or product of another project (404)', async () => {
      await http()
        .post(leadsUrl())
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: 'X', clientId: clientB })
        .expect(404);
      await http()
        .post(leadsUrl())
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: 'X', interestProductId: productB })
        .expect(404);

      const lead = await createLead({ name: 'Para PATCH' });
      await http()
        .patch(`${leadsUrl()}/${lead.id}`)
        .set('Cookie', as('A', 'MEMBER'))
        .send({ interestProductId: productB })
        .expect(404);
    });

    it('rejects a negative estimated value and an unknown source (400)', async () => {
      await http()
        .post(leadsUrl())
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: 'X', estimatedValue: -5 })
        .expect(400);
      await http()
        .post(leadsUrl())
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: 'X', source: 'TELEPATIA' })
        .expect(400);
    });

    it('clears a field with an explicit null', async () => {
      const lead = await createLead({ name: 'Con valor', estimatedValue: 10 });

      const updated = await http()
        .patch(`${leadsUrl()}/${lead.id}`)
        .set('Cookie', as('A', 'MEMBER'))
        .send({ estimatedValue: null })
        .expect(200);
      expect((updated.body as LeadBody).estimatedValue).toBeNull();
    });
  });

  describe('filters and sorting', () => {
    beforeAll(async () => {
      await createLead({
        name: 'Filtro Uno',
        company: 'Agro Filtros',
        source: 'WEBSITE',
        stage: 'NEW',
        estimatedValue: 100,
      });
      await createLead({
        name: 'Filtro Dos',
        company: 'Agro Filtros',
        source: 'WEBSITE',
        stage: 'CONTACTED',
        estimatedValue: 900,
      });
      await createLead({
        name: 'Filtro Tres',
        company: 'Agro Filtros',
        source: 'EVENT',
        stage: 'LOST',
      });
    });

    it('filters by several stages and by source', async () => {
      const response = await http()
        .get(
          `${leadsUrl()}?search=agro filtros&stages=NEW,CONTACTED&source=WEBSITE`,
        )
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      const names = (response.body as { data: LeadBody[] }).data.map(
        (lead) => lead.name,
      );
      expect(names.sort()).toEqual(['Filtro Dos', 'Filtro Uno']);
    });

    it('sorts by estimated value, descending, nulls last', async () => {
      const response = await http()
        .get(
          `${leadsUrl()}?search=agro filtros&sortBy=estimatedValue&order=desc`,
        )
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      expect(
        (response.body as { data: LeadBody[] }).data.map((lead) => lead.name),
      ).toEqual(['Filtro Dos', 'Filtro Uno', 'Filtro Tres']);
    });

    it('rejects an unknown stage inside stages (400)', async () => {
      await http()
        .get(`${leadsUrl()}?stages=NEW,VOLANDO`)
        .set('Cookie', as('A', 'VIEWER'))
        .expect(400);
    });
  });

  describe('Lead → Client conversion', () => {
    it('creates the client, links the lead and keeps tenant scope', async () => {
      const lead = await createLead({
        name: 'Rodrigo Castillo',
        email: 'rcastillo@tquetzal.gt',
        company: 'Transportes Quetzal',
        assignedUserId: seed.user('A', 'MEMBER'),
      });

      const response = await http()
        .post(`${leadsUrl()}/${lead.id}/convert`)
        .set('Cookie', as('A', 'MEMBER'))
        .send({ taxId: '7745213-8', markAsWon: true })
        .expect(201);
      const body = response.body as {
        client: {
          id: string;
          name: string;
          company: string;
          taxId: string;
          sourceLeadId: string;
          assignedUserId: string;
        };
        lead: LeadBody;
      };

      expect(body.client).toMatchObject({
        name: 'Rodrigo Castillo',
        company: 'Transportes Quetzal',
        // El NIT se guarda normalizado (C2).
        taxId: '77452138',
        sourceLeadId: lead.id,
        assignedUserId: seed.user('A', 'MEMBER'),
      });
      expect(body.lead.clientId).toBe(body.client.id);
      expect(body.lead.stage).toBe('WON');

      // Segunda conversión del mismo lead → 409.
      await http()
        .post(`${leadsUrl()}/${lead.id}/convert`)
        .set('Cookie', as('A', 'MEMBER'))
        .send({})
        .expect(409);

      // El cliente con un lead vinculado no se puede borrar → 409.
      await http()
        .delete(
          `/api/v1/projects/${seed.project('A')}/clients/${body.client.id}`,
        )
        .set('Cookie', as('A', 'OWNER'))
        .expect(409);

      // El filtro por cliente devuelve el lead convertido.
      const byClient = await http()
        .get(`${leadsUrl()}?clientId=${body.client.id}`)
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      expect(
        (byClient.body as { data: LeadBody[] }).data.map((l) => l.id),
      ).toEqual([lead.id]);
    });

    it('C8: of two simultaneous conversions exactly one wins and one client exists', async () => {
      const lead = await createLead({ name: 'Conversión doble' });
      const convert = () =>
        http()
          .post(`${leadsUrl()}/${lead.id}/convert`)
          .set('Cookie', as('A', 'MEMBER'))
          .send({});

      const responses = await Promise.all([convert(), convert()]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const created = await ctx.db
        .select()
        .from(clients)
        .where(eq(clients.sourceLeadId, lead.id));
      expect(created).toHaveLength(1);
    });

    it('forbids VIEWER (needs CLIENT_CREATE and LEAD_UPDATE)', async () => {
      const lead = await createLead({ name: 'Sin permiso' });
      await http()
        .post(`${leadsUrl()}/${lead.id}/convert`)
        .set('Cookie', as('A', 'VIEWER'))
        .send({})
        .expect(403);
    });

    it('returns 404 when converting a lead of another project', async () => {
      const foreign = (
        await http()
          .post(leadsUrl('B'))
          .set('Cookie', as('B', 'OWNER'))
          .send({ name: 'Lead de B' })
          .expect(201)
      ).body as LeadBody;

      await http()
        .post(`${leadsUrl('A')}/${foreign.id}/convert`)
        .set('Cookie', as('A', 'OWNER'))
        .send({})
        .expect(404);

      const untouched = await http()
        .get(`${leadsUrl('B')}/${foreign.id}`)
        .set('Cookie', as('B', 'OWNER'))
        .expect(200);
      expect((untouched.body as LeadBody).clientId).toBeNull();
    });
  });
});
