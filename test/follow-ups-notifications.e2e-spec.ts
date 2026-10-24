import { eq } from 'drizzle-orm';
import request from 'supertest';
import { leads } from '../src/db/schema';
import { RunRemindersUseCase } from '../src/notifications/application/use-cases/run-reminders.use-case';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

interface FollowUpBody {
  id: string;
  status: string;
  overdue: boolean;
  assignedUserId: string | null;
  lead: { id: string; name: string };
}

interface NotificationBody {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
}

// Seguimientos (agenda, próximo seguimiento, completar) y notificaciones
// (campana, recordatorios automáticos, aviso de aprobación).
describe('Follow-ups and notifications (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let leadId: string;

  const http = () => request(ctx.app.getHttpServer());
  const as = (role: Role, key = 'A') => ctx.cookie(seed.user(key, role));
  const url = (path: string, key = 'A') =>
    `/api/v1/projects/${seed.project(key)}${path}`;
  const hour = 3_600_000;

  const createFollowUp = (body: object, role: Role = 'MEMBER') =>
    http()
      .post(url(`/leads/${leadId}/follow-ups`))
      .set('Cookie', as(role))
      .send({ title: 'Llamar', type: 'CALL', ...body });

  const notificationsOf = async (role: Role) =>
    (
      await http()
        .get(url('/notifications'))
        .set('Cookie', as(role))
        .expect(200)
    ).body as { data: NotificationBody[]; unreadCount: number };

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
    leadId = (
      (
        await http()
          .post(url('/leads'))
          .set('Cookie', as('OWNER'))
          .send({ name: 'Ana Pérez' })
          .expect(201)
      ).body as { id: string }
    ).id;
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('follow-ups', () => {
    it('creates one assigned to its creator and shows it as the lead next follow-up', async () => {
      const dueAt = new Date(Date.now() + 2 * hour).toISOString();
      const created = (await createFollowUp({ dueAt }).expect(201))
        .body as FollowUpBody;

      expect(created).toMatchObject({
        status: 'PENDING',
        overdue: false,
        assignedUserId: seed.user('A', 'MEMBER'),
        lead: { id: leadId, name: 'Ana Pérez' },
      });

      const lead = (
        await http()
          .get(url(`/leads/${leadId}`))
          .set('Cookie', as('VIEWER'))
          .expect(200)
      ).body as { nextFollowUpAt: string };
      expect(new Date(lead.nextFollowUpAt).toISOString()).toBe(dueAt);
    });

    it('lets a VIEWER read the agenda but not create follow-ups', async () => {
      await http()
        .get(url(`/follow-ups?leadId=${leadId}`))
        .set('Cookie', as('VIEWER'))
        .expect(200);
      await createFollowUp(
        { dueAt: new Date(Date.now() + hour).toISOString() },
        'VIEWER',
      ).expect(403);
    });

    it('completes a follow-up once (DONE is final) and updates the lead last contact', async () => {
      const followUp = (
        await createFollowUp({
          dueAt: new Date(Date.now() + hour).toISOString(),
        }).expect(201)
      ).body as FollowUpBody;

      const done = (
        await http()
          .patch(url(`/follow-ups/${followUp.id}`))
          .set('Cookie', as('MEMBER'))
          .send({ status: 'DONE', outcome: 'Pide demo el martes' })
          .expect(200)
      ).body as FollowUpBody & { completedAt: string | null };
      expect(done.status).toBe('DONE');
      expect(done.completedAt).not.toBeNull();

      const [row] = await ctx.db
        .select()
        .from(leads)
        .where(eq(leads.id, leadId));
      expect(row.lastContactAt).not.toBeNull();

      await http()
        .patch(url(`/follow-ups/${followUp.id}`))
        .set('Cookie', as('MEMBER'))
        .send({ title: 'Otro' })
        .expect(409);
    });

    it('filters overdue follow-ups and counts them in the Dashboard', async () => {
      await createFollowUp({
        dueAt: new Date(Date.now() - hour).toISOString(),
        title: 'Vencido',
      }).expect(201);

      const overdue = (
        await http()
          .get(url('/follow-ups?overdue=true'))
          .set('Cookie', as('OWNER'))
          .expect(200)
      ).body as { data: FollowUpBody[] };
      expect(overdue.data.length).toBeGreaterThanOrEqual(1);
      expect(overdue.data.every((item) => item.overdue)).toBe(true);

      const dashboard = (
        await http()
          .get(url('/dashboard'))
          .set('Cookie', as('OWNER'))
          .expect(200)
      ).body as {
        summary: {
          seguimientosPendientes: number;
          seguimientosVencidos: number;
        };
      };
      // Pendientes: el del primer test y el vencido; el completado no cuenta.
      expect(dashboard.summary.seguimientosPendientes).toBe(2);
      expect(dashboard.summary.seguimientosVencidos).toBe(1);
    });

    it('answers 404 for a lead or a follow-up of another project', async () => {
      const foreignLead = (
        (
          await http()
            .post(url('/leads', 'B'))
            .set('Cookie', as('OWNER', 'B'))
            .send({ name: 'Lead B' })
            .expect(201)
        ).body as { id: string }
      ).id;
      await http()
        .post(url(`/leads/${foreignLead}/follow-ups`))
        .set('Cookie', as('OWNER'))
        .send({ title: 'x', dueAt: new Date().toISOString() })
        .expect(404);
    });
  });

  describe('notifications', () => {
    it('reminds the assignee once when a follow-up is due (idempotent job)', async () => {
      const reminders = ctx.app.get(RunRemindersUseCase);
      await reminders.execute();
      await reminders.execute();

      const mine = await notificationsOf('MEMBER');
      const due = mine.data.filter((item) => item.type === 'FOLLOW_UP_DUE');
      // Solo el seguimiento vencido; repetir el job no duplica el aviso.
      expect(due).toHaveLength(1);
      expect(due[0].entityType).toBe('FOLLOW_UP');
    });

    it('notifies the approvers (not the actor) when approval is requested', async () => {
      const product = (
        (
          await http()
            .post(url('/products'))
            .set('Cookie', as('OWNER'))
            .send({ name: 'Servicio', price: 100 })
            .expect(201)
        ).body as { id: string }
      ).id;
      const quote = (
        (
          await http()
            .post(url('/quotes'))
            .set('Cookie', as('MEMBER'))
            .send({ leadId, items: [{ productId: product, quantity: 1 }] })
            .expect(201)
        ).body as { id: string }
      ).id;
      await http()
        .patch(url(`/quotes/${quote}/status`))
        .set('Cookie', as('MEMBER'))
        .send({ status: 'PENDING_APPROVAL' })
        .expect(200);

      const owner = await notificationsOf('OWNER');
      expect(
        owner.data.some(
          (item) =>
            item.type === 'QUOTE_PENDING_APPROVAL' && item.entityId === quote,
        ),
      ).toBe(true);
      const member = await notificationsOf('MEMBER');
      expect(
        member.data.some((item) => item.type === 'QUOTE_PENDING_APPROVAL'),
      ).toBe(false);

      // Aprobar avisa a quien creó la cotización.
      await http()
        .patch(url(`/quotes/${quote}/status`))
        .set('Cookie', as('OWNER'))
        .send({ status: 'APPROVED' })
        .expect(200);
      const afterApproval = await notificationsOf('MEMBER');
      expect(
        afterApproval.data.some((item) => item.type === 'QUOTE_APPROVED'),
      ).toBe(true);
    });

    it('marks one or all as read, and never touches another user notification', async () => {
      const before = await notificationsOf('OWNER');
      expect(before.unreadCount).toBeGreaterThan(0);
      const first = before.data[0];

      // Otro usuario no puede marcarla: para él no existe.
      await http()
        .post(url(`/notifications/${first.id}/read`))
        .set('Cookie', as('MEMBER'))
        .expect(404);

      await http()
        .post(url(`/notifications/${first.id}/read`))
        .set('Cookie', as('OWNER'))
        .expect(204);
      const count = (
        await http()
          .get(url('/notifications/unread-count'))
          .set('Cookie', as('OWNER'))
          .expect(200)
      ).body as { unreadCount: number };
      expect(count.unreadCount).toBe(before.unreadCount - 1);

      await http()
        .post(url('/notifications/read-all'))
        .set('Cookie', as('OWNER'))
        .expect(204);
      expect((await notificationsOf('OWNER')).unreadCount).toBe(0);
    });
  });
});
