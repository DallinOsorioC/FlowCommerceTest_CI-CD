import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { leads, notifications, quotes } from '../src/db/schema';
import { RunRemindersUseCase } from '../src/notifications/application/use-cases/run-reminders.use-case';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

// Pantallas del frontend: pestañas de notificaciones («Lead sin actividad»),
// vistas guardadas del listado de leads, la cabecera de Clientes y la pestaña
// Roles.
describe('Notifications tabs, lead views and clients summary (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  const http = () => request(ctx.app.getHttpServer());
  const as = (role: Role, key = 'A') => ctx.cookie(seed.user(key, role));
  const url = (path: string, key = 'A') =>
    `/api/v1/projects/${seed.project(key)}${path}`;
  const DAY = 24 * 60 * 60 * 1000;

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

  describe('notification tabs', () => {
    const insert = (type: string, key: string) =>
      ctx.db.insert(notifications).values({
        projectId: seed.project('A'),
        userId: seed.user('A', 'OWNER'),
        type,
        title: `aviso ${type}`,
        dedupeKey: `e2e:${key}`,
      });

    beforeAll(async () => {
      await insert('QUOTE_PAID', 'q1');
      await insert('QUOTE_PENDING_APPROVAL', 'q2');
      await insert('MESSAGE_RECEIVED', 'm1');
      await insert('FOLLOW_UP_DUE', 'f1');
      await insert('LEAD_STALE', 'l1');
    });

    const types = async (query: string) =>
      (
        (
          await http()
            .get(url(`/notifications${query}`))
            .set('Cookie', as('OWNER'))
            .expect(200)
        ).body as { data: { type: string }[] }
      ).data
        .map((n) => n.type)
        .sort();

    it('groups several types under one tab', async () => {
      expect(await types('?category=QUOTE')).toEqual([
        'QUOTE_PAID',
        'QUOTE_PENDING_APPROVAL',
      ]);
      expect(await types('?category=MESSAGE')).toEqual(['MESSAGE_RECEIVED']);
      expect(await types('?category=FOLLOW_UP')).toEqual(['FOLLOW_UP_DUE']);
      expect(await types('?category=LEAD')).toEqual(['LEAD_STALE']);
    });

    it('lists everything without a category', async () => {
      expect(await types('')).toHaveLength(5);
    });

    it('combines category with type, and an impossible mix is empty', async () => {
      expect(await types('?category=QUOTE&type=QUOTE_PAID')).toEqual([
        'QUOTE_PAID',
      ]);
      expect(await types('?category=QUOTE&type=MESSAGE_RECEIVED')).toEqual([]);
    });

    it('rejects an unknown category (400)', async () => {
      await http()
        .get(url('/notifications?category=OPORTUNIDADES'))
        .set('Cookie', as('OWNER'))
        .expect(400);
    });

    it('never shows another user’s notifications', async () => {
      const res = await http()
        .get(url('/notifications?category=QUOTE'))
        .set('Cookie', as('MEMBER'))
        .expect(200);
      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });
  });

  describe('stale lead reminder', () => {
    let leadId: string;
    const countStale = async () =>
      (
        await ctx.db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.projectId, seed.project('A')),
              eq(notifications.type, 'LEAD_STALE'),
              eq(notifications.entityId, leadId),
            ),
          )
      ).length;

    beforeAll(async () => {
      leadId = (
        (
          await http()
            .post(url('/leads'))
            .set('Cookie', as('OWNER'))
            .send({
              name: 'Gabriela Pérez',
              email: 'g@tikal.test',
              assignedUserId: seed.user('A', 'MEMBER'),
            })
            .expect(201)
        ).body as { id: string }
      ).id;
    });

    it('does not notify a lead contacted recently', async () => {
      await ctx.db
        .update(leads)
        .set({ lastContactAt: new Date(Date.now() - 2 * DAY) })
        .where(eq(leads.id, leadId));
      await ctx.app.get(RunRemindersUseCase).execute();
      expect(await countStale()).toBe(0);
    });

    it('notifies the assigned advisor once a week passes, and only once', async () => {
      await ctx.db
        .update(leads)
        .set({ lastContactAt: new Date(Date.now() - 8 * DAY) })
        .where(eq(leads.id, leadId));

      await ctx.app.get(RunRemindersUseCase).execute();
      await ctx.app.get(RunRemindersUseCase).execute();

      expect(await countStale()).toBe(1);
      const res = await http()
        .get(url('/notifications?category=LEAD'))
        .set('Cookie', as('MEMBER'))
        .expect(200);
      const stale = (
        res.body as { data: { type: string; title: string }[] }
      ).data.filter((n) => n.type === 'LEAD_STALE');
      expect(stale).toHaveLength(1);
      expect(stale[0].title).toContain('Gabriela Pérez');
    });

    it('stops reminding once the lead is won or lost', async () => {
      const other = (
        (
          await http()
            .post(url('/leads'))
            .set('Cookie', as('OWNER'))
            .send({ name: 'Ya cerrado', email: 'c@cerrado.test' })
            .expect(201)
        ).body as { id: string }
      ).id;
      await ctx.db
        .update(leads)
        .set({ stage: 'LOST', lastContactAt: new Date(Date.now() - 30 * DAY) })
        .where(eq(leads.id, other));

      await ctx.app.get(RunRemindersUseCase).execute();

      const rows = await ctx.db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.entityId, other));
      expect(rows).toHaveLength(0);
    });
  });

  describe('saved lead views', () => {
    let viewId: string;

    it('lets any member save a view with filters', async () => {
      const res = await http()
        .post(url('/lead-views'))
        .set('Cookie', as('MEMBER'))
        .send({
          name: 'Mis leads en negociación',
          filters: {
            stages: ['NEGOTIATION'],
            assignedUserId: seed.user('A', 'MEMBER'),
            sortBy: 'createdAt',
            order: 'desc',
          },
        })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Mis leads en negociación',
        filters: { stages: ['NEGOTIATION'], order: 'desc' },
      });
      viewId = (res.body as { id: string }).id;
    });

    it('rejects a repeated name (409)', async () => {
      await http()
        .post(url('/lead-views'))
        .set('Cookie', as('MEMBER'))
        .send({ name: 'Mis leads en negociación' })
        .expect(409);
    });

    it('validates the filters like GET /leads does (400)', async () => {
      await http()
        .post(url('/lead-views'))
        .set('Cookie', as('MEMBER'))
        .send({ name: 'Mala', filters: { stage: 'INVENTADA' } })
        .expect(400);
      await http()
        .post(url('/lead-views'))
        .set('Cookie', as('MEMBER'))
        .send({ name: 'Mala', filters: { projectId: seed.project('B') } })
        .expect(400);
    });

    it('is personal: another member of the project sees none and cannot touch it', async () => {
      const list = await http()
        .get(url('/lead-views'))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect(list.body).toEqual([]);

      await http()
        .patch(url(`/lead-views/${viewId}`))
        .set('Cookie', as('OWNER'))
        .send({ name: 'robada' })
        .expect(404);
      await http()
        .delete(url(`/lead-views/${viewId}`))
        .set('Cookie', as('OWNER'))
        .expect(404);
    });

    it('does not leak across projects (403)', async () => {
      await http()
        .get(url('/lead-views', 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(200)
        .expect([]);
      await http()
        .get(url('/lead-views'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(403);
    });

    it('renames and deletes its own view', async () => {
      const renamed = await http()
        .patch(url(`/lead-views/${viewId}`))
        .set('Cookie', as('MEMBER'))
        .send({ name: 'Negociación', filters: { search: 'nova' } })
        .expect(200);
      expect(renamed.body).toMatchObject({
        name: 'Negociación',
        filters: { search: 'nova' },
      });
      await http()
        .delete(url(`/lead-views/${viewId}`))
        .set('Cookie', as('MEMBER'))
        .expect(204);
    });
  });

  describe('clients header summary', () => {
    let productId: string;

    const createClient = async (name: string) =>
      (
        (
          await http()
            .post(url('/clients'))
            .set('Cookie', as('OWNER'))
            .send({ name })
            .expect(201)
        ).body as { id: string }
      ).id;

    const summary = async (query = '') =>
      (
        (
          await http()
            .get(url(`/clients${query}`))
            .set('Cookie', as('OWNER'))
            .expect(200)
        ).body as {
          summary: { activeClients: number; billedThisYear: number };
        }
      ).summary;

    const payQuote = async (clientId: string, paidAt: Date) => {
      const lead = await http()
        .post(url('/leads'))
        .set('Cookie', as('OWNER'))
        .send({ name: 'Lead de la venta', email: 'venta@cliente.test' })
        .expect(201);
      const created = await http()
        .post(url('/quotes'))
        .set('Cookie', as('OWNER'))
        .send({
          leadId: (lead.body as { id: string }).id,
          clientId,
          items: [{ productId, quantity: 2 }],
        })
        .expect(201);
      const { id, total } = created.body as { id: string; total: number };
      await ctx.db
        .update(quotes)
        .set({ status: 'PAID', paidAt })
        .where(eq(quotes.id, id));
      return total;
    };

    beforeAll(async () => {
      productId = (
        (
          await http()
            .post(url('/products'))
            .set('Cookie', as('OWNER'))
            .send({ name: 'Licencia anual', price: 500 })
            .expect(201)
        ).body as { id: string }
      ).id;
    });

    it('starts empty', async () => {
      expect(await summary()).toEqual({ activeClients: 0, billedThisYear: 0 });
    });

    it('counts active clients and what was billed this year', async () => {
      const a = await createClient('Transportes Quetzal');
      const b = await createClient('Grupo Atlas');
      const inactive = await createClient('Cliente dormido');
      await http()
        .patch(url(`/clients/${inactive}`))
        .set('Cookie', as('OWNER'))
        .send({ active: false })
        .expect(200);

      const thisYear = await payQuote(a, new Date());
      await payQuote(b, new Date());
      // Pagada el año pasado: no cuenta como «facturado este año».
      await payQuote(
        a,
        new Date(Date.UTC(new Date().getUTCFullYear() - 1, 5, 1)),
      );

      expect(await summary()).toEqual({
        activeClients: 2,
        billedThisYear: thisYear * 2,
      });
    });

    it('does not change with filters or pagination', async () => {
      const full = await summary();
      expect(await summary('?search=Atlas')).toEqual(full);
      expect(await summary('?limit=1&page=2')).toEqual(full);
    });

    it('is scoped to the project', async () => {
      const res = await http()
        .get(url('/clients', 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(200);
      expect((res.body as { summary: unknown }).summary).toEqual({
        activeClients: 0,
        billedThisYear: 0,
      });
    });
  });

  describe('roles tab', () => {
    type Catalog = {
      roles: { role: string; label: string; permissions: string[] }[];
      permissions: { key: string; area: string }[];
    };

    it('lets any member, even a VIEWER, read the role matrix', async () => {
      const res = await http()
        .get(url('/roles'))
        .set('Cookie', as('VIEWER'))
        .expect(200);
      const body = res.body as Catalog;

      expect(body.roles.map((r) => r.role)).toEqual([
        'OWNER',
        'ADMIN',
        'MEMBER',
        'VIEWER',
      ]);
      const viewer = body.roles.find((r) => r.role === 'VIEWER');
      expect(viewer?.permissions).toContain('LEAD_READ');
      expect(viewer?.permissions).not.toContain('LEAD_UPDATE');
      expect(body.permissions.length).toBeGreaterThan(10);
    });

    it('is closed to people outside the project (403) and to anonymous (401)', async () => {
      await http()
        .get(url('/roles'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(403);
      await http().get(url('/roles')).expect(401);
    });
  });
});
