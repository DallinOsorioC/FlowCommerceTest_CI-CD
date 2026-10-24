import request from 'supertest';
import {
  EMAIL_SENDER,
  type EmailMessage,
} from '../src/auth/application/ports/email-sender';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

// Búsqueda global (barra superior) e invitaciones por correo.
describe('Global search and invitations (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  const sent: EmailMessage[] = [];

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role) => ctx.cookie(seed.user(key, role));
  const url = (path: string, key = 'A') =>
    `/api/v1/projects/${seed.project(key)}${path}`;
  const emailOf = (key: string, role: Role) =>
    `e2e-${seed.user(key, role)}@flowcommerce.test`;
  const tokenFrom = (message: EmailMessage) =>
    decodeURIComponent(/token=([^\s"]+)/.exec(message.text)?.[1] ?? '');

  beforeAll(async () => {
    ctx = await createE2eApp((builder) => {
      builder.overrideProvider(EMAIL_SENDER).useValue({
        send: (message: EmailMessage) => {
          sent.push(message);
          return Promise.resolve();
        },
      });
    });
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, ADMIN: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
      { key: 'C', members: { OWNER: 1 } },
    ]);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('search', () => {
    beforeAll(async () => {
      const post = (path: string, body: object, key = 'A') =>
        http()
          .post(url(path, key))
          .set('Cookie', as(key, 'OWNER'))
          .send(body)
          .expect(201);
      const client = (
        (await post('/clients', { name: 'Transportes Quetzal' })).body as {
          id: string;
        }
      ).id;
      const lead = (
        (await post('/leads', { name: 'Rodrigo Quetzal', clientId: client }))
          .body as { id: string }
      ).id;
      await post('/quotes', { leadId: lead, clientId: client });
      // Ruido en otro proyecto con el mismo término.
      await post('/leads', { name: 'Quetzal de B' }, 'B');
    });

    it('finds leads, clients and quotes of the project only', async () => {
      const res = await http()
        .get(url('/search?q=quetzal'))
        .set('Cookie', as('A', 'VIEWER'))
        .expect(200);
      const body = res.body as {
        leads: { name: string }[];
        clients: { name: string }[];
        quotes: { customerName: string }[];
      };

      expect(body.leads.map((lead) => lead.name)).toEqual(['Rodrigo Quetzal']);
      expect(body.clients.map((client) => client.name)).toEqual([
        'Transportes Quetzal',
      ]);
      expect(body.quotes).toHaveLength(1);
      expect(body.quotes[0].customerName).toBe('Transportes Quetzal');
    });

    it('requires at least 2 characters (400) and membership (403)', async () => {
      await http()
        .get(url('/search?q=q'))
        .set('Cookie', as('A', 'OWNER'))
        .expect(400);
      await http()
        .get(url('/search?q=quetzal'))
        .set('Cookie', as('B', 'OWNER'))
        .expect(403);
    });
  });

  describe('invitations', () => {
    it('invites by email, previews and accepts with the same account', async () => {
      const invited = emailOf('B', 'OWNER');
      const created = await http()
        .post(url('/invitations'))
        .set('Cookie', as('A', 'OWNER'))
        .send({ email: invited, role: 'MEMBER' })
        .expect(201);
      expect(created.body).not.toHaveProperty('tokenHash');
      expect(sent.at(-1)?.to).toBe(invited);
      const token = tokenFrom(sent.at(-1)!);

      const preview = await http()
        .post('/api/v1/invitations/preview')
        .send({ token })
        .expect(200);
      expect(preview.body).toMatchObject({
        projectId: seed.project('A'),
        email: invited,
        role: 'MEMBER',
      });

      // Otra cuenta no puede usar el enlace.
      await http()
        .post('/api/v1/invitations/accept')
        .set('Cookie', as('C', 'OWNER'))
        .send({ token })
        .expect(403);

      await http()
        .post('/api/v1/invitations/accept')
        .set('Cookie', as('B', 'OWNER'))
        .send({ token })
        .expect(200);

      // Ya es miembro: puede leer el proyecto A; el enlace no sirve dos veces.
      await http().get(url('')).set('Cookie', as('B', 'OWNER')).expect(200);
      await http()
        .post('/api/v1/invitations/accept')
        .set('Cookie', as('B', 'OWNER'))
        .send({ token })
        .expect(409);
    });

    it('re-inviting replaces the previous link and revoking disables it', async () => {
      const invited = emailOf('C', 'OWNER');
      const invite = () =>
        http()
          .post(url('/invitations'))
          .set('Cookie', as('A', 'OWNER'))
          .send({ email: invited, role: 'VIEWER' })
          .expect(201);

      await invite();
      const firstToken = tokenFrom(sent.at(-1)!);
      const second = (await invite()).body as { id: string };
      const secondToken = tokenFrom(sent.at(-1)!);

      await http()
        .post('/api/v1/invitations/preview')
        .send({ token: firstToken })
        .expect(404);

      const pending = (
        await http()
          .get(url('/invitations'))
          .set('Cookie', as('A', 'ADMIN'))
          .expect(200)
      ).body as { id: string; email: string }[];
      expect(pending.filter((item) => item.email === invited)).toHaveLength(1);

      await http()
        .delete(url(`/invitations/${second.id}`))
        .set('Cookie', as('A', 'OWNER'))
        .expect(204);
      await http()
        .post('/api/v1/invitations/accept')
        .set('Cookie', as('C', 'OWNER'))
        .send({ token: secondToken })
        .expect(404);
    });

    it('applies the role hierarchy and the permissions', async () => {
      // ADMIN no puede invitar a otro ADMIN; VIEWER no puede invitar.
      await http()
        .post(url('/invitations'))
        .set('Cookie', as('A', 'ADMIN'))
        .send({ email: 'otro@flowcommerce.test', role: 'ADMIN' })
        .expect(403);
      await http()
        .post(url('/invitations'))
        .set('Cookie', as('A', 'VIEWER'))
        .send({ email: 'otro@flowcommerce.test', role: 'VIEWER' })
        .expect(403);
      // OWNER no se invita.
      await http()
        .post(url('/invitations'))
        .set('Cookie', as('A', 'OWNER'))
        .send({ email: 'otro@flowcommerce.test', role: 'OWNER' })
        .expect(400);
    });

    it('answers 409 when inviting someone who is already a member', async () => {
      await http()
        .post(url('/invitations'))
        .set('Cookie', as('A', 'OWNER'))
        .send({ email: emailOf('A', 'VIEWER'), role: 'MEMBER' })
        .expect(409);
    });
  });
});
