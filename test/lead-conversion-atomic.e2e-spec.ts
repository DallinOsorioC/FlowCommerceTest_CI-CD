import { eq } from 'drizzle-orm';
import request from 'supertest';
import { clients, leads, messages } from '../src/db/schema';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

// Conversión lead → cliente atómica (C3), lead convertido y con mensajes
// protegidos también a nivel de base (C6 y FK de messages).
describe('Lead conversion & history protection at DB level (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role) => ctx.cookie(seed.user(key, role));
  const base = (key = 'A') => `/api/v1/projects/${seed.project(key)}`;

  const newLead = async (key = 'A', name = 'Lead conv') =>
    (
      await http()
        .post(`${base(key)}/leads`)
        .set('Cookie', as(key, 'OWNER'))
        .send({ name })
        .expect(201)
    ).body as { id: string };

  const convert = (leadId: string, body: object = {}, role: Role = 'MEMBER') =>
    http()
      .post(`${base()}/leads/${leadId}/convert`)
      .set('Cookie', as('A', role))
      .send(body);

  const clientsOfLead = (leadId: string) =>
    ctx.db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.sourceLeadId, leadId));

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('atomic conversion', () => {
    it('lets a MEMBER convert and creates exactly one linked client', async () => {
      const lead = await newLead();

      const body = (await convert(lead.id, { markAsWon: true }).expect(201))
        .body as {
        client: { id: string; sourceLeadId: string };
        lead: { clientId: string; stage: string };
      };

      expect(body.client.sourceLeadId).toBe(lead.id);
      expect(body.lead).toMatchObject({
        clientId: body.client.id,
        stage: 'WON',
      });
      expect(await clientsOfLead(lead.id)).toHaveLength(1);
    });

    it('lets exactly one of several simultaneous conversions win and leaves no orphan client', async () => {
      const lead = await newLead();

      const responses = await Promise.all(
        Array.from({ length: 6 }, () => convert(lead.id)),
      );
      const statuses = responses.map((response) => response.status).sort();

      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(5);
      // Los 5 perdedores revirtieron su cliente: solo existe el ganador.
      expect(await clientsOfLead(lead.id)).toHaveLength(1);
    });

    it('rolls back everything when the tax id is already taken', async () => {
      const first = await newLead('A', 'Con NIT');
      await convert(first.id, { taxId: '900-1' }).expect(201);

      const second = await newLead('A', 'Mismo NIT');
      await convert(second.id, { taxId: '900-1' }).expect(409);

      expect(await clientsOfLead(second.id)).toHaveLength(0);
      const [row] = await ctx.db
        .select({ clientId: leads.clientId })
        .from(leads)
        .where(eq(leads.id, second.id));
      expect(row.clientId).toBeNull();
    });

    it('forbids VIEWER and answers 404 for a lead of another project', async () => {
      const lead = await newLead();
      await convert(lead.id, {}, 'VIEWER').expect(403);
      expect(await clientsOfLead(lead.id)).toHaveLength(0);

      const foreign = await newLead('B');
      await convert(foreign.id).expect(404);
      expect(await clientsOfLead(foreign.id)).toHaveLength(0);
    });
  });

  describe('link to an existing client and duplicate warning (C1)', () => {
    const newClient = async (body: object, key = 'A') =>
      (
        await http()
          .post(`${base(key)}/clients`)
          .set('Cookie', as(key, 'OWNER'))
          .send(body)
          .expect(201)
      ).body as { id: string };

    it('links the lead to an existing client without creating another one', async () => {
      const existing = await newClient({ name: 'Nova', company: 'Nova S.A.' });
      const lead = await newLead();
      const before = await ctx.db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.projectId, seed.project('A')));

      const body = (
        await convert(lead.id, {
          clientId: existing.id,
          markAsWon: true,
        }).expect(201)
      ).body as {
        client: { id: string };
        lead: { clientId: string; stage: string };
        possibleDuplicates: unknown[];
      };

      expect(body.client.id).toBe(existing.id);
      expect(body.lead).toMatchObject({ clientId: existing.id, stage: 'WON' });
      expect(body.possibleDuplicates).toEqual([]);
      const after = await ctx.db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.projectId, seed.project('A')));
      expect(after).toHaveLength(before.length);
    });

    it('rejects a client of another project (404), an inactive one (409) and extra fields (400)', async () => {
      const lead = await newLead();

      const foreign = await newClient({ name: 'De B' }, 'B');
      await convert(lead.id, { clientId: foreign.id }).expect(404);

      const inactive = await newClient({ name: 'Inactivo' });
      await http()
        .patch(`${base()}/clients/${inactive.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .send({ active: false })
        .expect(200);
      await convert(lead.id, { clientId: inactive.id }).expect(409);

      const active = await newClient({ name: 'Activo' });
      await convert(lead.id, { clientId: active.id, taxId: '123' }).expect(400);

      const [row] = await ctx.db
        .select({ clientId: leads.clientId })
        .from(leads)
        .where(eq(leads.id, lead.id));
      expect(row.clientId).toBeNull();
    });

    it('refuses to link a lead that already has a client', async () => {
      const existing = await newClient({ name: 'Otro' });
      const lead = await newLead();
      await convert(lead.id).expect(201);

      await convert(lead.id, { clientId: existing.id }).expect(409);
    });

    it('warns about possible duplicates by company or email, case-insensitively', async () => {
      const byCompany = await newClient({
        name: 'Cliente Uno',
        company: 'Constructora Delta',
      });
      const byEmail = await newClient({
        name: 'Cliente Dos',
        email: 'compras@delta.gt',
      });
      const unrelated = await newClient({ name: 'Sin relación' });

      const lead = (
        await http()
          .post(`${base()}/leads`)
          .set('Cookie', as('A', 'OWNER'))
          .send({
            name: 'Lead Delta',
            company: 'CONSTRUCTORA DELTA',
            email: 'Compras@Delta.GT',
          })
          .expect(201)
      ).body as { id: string };

      const body = (await convert(lead.id).expect(201)).body as {
        client: { id: string };
        possibleDuplicates: { id: string }[];
      };

      const ids = body.possibleDuplicates.map((client) => client.id);
      expect(ids).toEqual(expect.arrayContaining([byCompany.id, byEmail.id]));
      expect(ids).not.toContain(unrelated.id);
      expect(ids).not.toContain(body.client.id);
    });

    it('never reports clients of another project as duplicates', async () => {
      await newClient({ name: 'Ajeno', company: 'Empresa Compartida' }, 'B');
      const lead = (
        await http()
          .post(`${base()}/leads`)
          .set('Cookie', as('A', 'OWNER'))
          .send({ name: 'Lead', company: 'Empresa Compartida' })
          .expect(201)
      ).body as { id: string };

      const body = (await convert(lead.id).expect(201)).body as {
        possibleDuplicates: unknown[];
      };
      expect(body.possibleDuplicates).toEqual([]);
    });
  });

  describe('history protection', () => {
    it('refuses with 409 to delete a converted lead and keeps its client', async () => {
      const lead = await newLead();
      await convert(lead.id).expect(201);

      await http()
        .delete(`${base()}/leads/${lead.id}`)
        .set('Cookie', as('A', 'OWNER'))
        .expect(409);

      expect(await clientsOfLead(lead.id)).toHaveLength(1);
    });

    it('the database itself refuses to delete a lead that has messages', async () => {
      const lead = await newLead();
      await ctx.db.insert(messages).values({
        projectId: seed.project('A'),
        leadId: lead.id,
        whatsappMessageId: `wamid.fk-${lead.id}`,
        direction: 'INBOUND',
        content: 'Hola',
      });

      // Sin pasar por la aplicación: la FK NO ACTION lo impide.
      await expect(
        ctx.db.delete(leads).where(eq(leads.id, lead.id)),
      ).rejects.toThrow();

      const kept = await ctx.db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.leadId, lead.id));
      expect(kept).toHaveLength(1);
    });

    it('the database itself refuses to delete the source lead of a client', async () => {
      const lead = await newLead();
      await convert(lead.id).expect(201);

      await expect(
        ctx.db.delete(leads).where(eq(leads.id, lead.id)),
      ).rejects.toThrow();
    });

    it('rejects a client whose source lead belongs to another project', async () => {
      const foreignLead = await newLead('B');

      await expect(
        ctx.db.insert(clients).values({
          projectId: seed.project('A'),
          name: 'Cliente con origen ajeno',
          sourceLeadId: foreignLead.id,
        }),
      ).rejects.toThrow();
    });
  });
});
