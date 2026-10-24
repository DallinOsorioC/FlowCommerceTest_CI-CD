import request from 'supertest';
import { signPaymentPayload } from '../src/integrations/domain/payments';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

// Archivos (adjuntos y foto de perfil), historial de actividad y las
// integraciones con IA (API key) y Pagos (link + webhook firmado).
describe('Files, activity and integrations (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let leadId: string;
  let productId: string;

  const http = () => request(ctx.app.getHttpServer());
  const as = (role: Role, key = 'A') => ctx.cookie(seed.user(key, role));
  const url = (path: string, key = 'A') =>
    `/api/v1/projects/${seed.project(key)}${path}`;
  const pdf = Buffer.from('%PDF-1.7\n% FlowCommerce e2e\n');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  // supertest no junta el cuerpo binario por defecto: se lee como Buffer.
  const binary = (
    res: request.Response,
    done: (err: Error | null, body: Buffer) => void,
  ) => {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => done(null, Buffer.concat(chunks)));
  };

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
          .send({ name: 'Ana Torres', email: 'ana@cliente.test' })
          .expect(201)
      ).body as { id: string }
    ).id;
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

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('attachments', () => {
    let attachmentId: string;

    it('uploads a PDF to a lead and keeps a safe file name', async () => {
      const res = await http()
        .post(url('/attachments'))
        .set('Cookie', as('MEMBER'))
        .field('leadId', leadId)
        .attach('file', pdf, {
          filename: '../../propuesta.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const body = res.body as {
        id: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        leadId: string;
      };
      expect(body).toMatchObject({
        fileName: 'propuesta.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
        leadId,
      });
      attachmentId = body.id;
    });

    it('rejects a file whose content does not match its type (400)', async () => {
      await http()
        .post(url('/attachments'))
        .set('Cookie', as('MEMBER'))
        .field('leadId', leadId)
        .attach('file', Buffer.from('MZ not really a png'), {
          filename: 'foto.png',
          contentType: 'image/png',
        })
        .expect(400);
    });

    it('does not let a VIEWER upload (403)', async () => {
      await http()
        .post(url('/attachments'))
        .set('Cookie', as('VIEWER'))
        .field('leadId', leadId)
        .attach('file', pdf, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(403);
    });

    it('lists and downloads the same bytes for any member', async () => {
      const list = await http()
        .get(url(`/attachments?leadId=${leadId}`))
        .set('Cookie', as('VIEWER'))
        .expect(200);
      expect(
        (list.body as { data: { id: string }[] }).data.map((a) => a.id),
      ).toEqual([attachmentId]);

      const res = await http()
        .get(url(`/attachments/${attachmentId}/download`))
        .set('Cookie', as('VIEWER'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(res.get('Content-Type')).toContain('application/pdf');
      expect(res.get('Content-Disposition')).toContain('propuesta.pdf');
      expect(res.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.body as Buffer).toEqual(pdf);
    });

    it('answers 404 for an attachment of another project', async () => {
      await http()
        .get(url(`/attachments/${attachmentId}/download`, 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(404);
    });

    it('leaves a line in the lead activity', async () => {
      const res = await http()
        .get(url(`/activity?leadId=${leadId}`))
        .set('Cookie', as('VIEWER'))
        .expect(200);
      const types = (res.body as { data: { type: string }[] }).data.map(
        (event) => event.type,
      );
      expect(types).toEqual(
        expect.arrayContaining(['LEAD_CREATED', 'ATTACHMENT_ADDED']),
      );
    });

    it('deletes the attachment (204) and then it no longer exists', async () => {
      await http()
        .delete(url(`/attachments/${attachmentId}`))
        .set('Cookie', as('MEMBER'))
        .expect(204);
      await http()
        .get(url(`/attachments/${attachmentId}/download`))
        .set('Cookie', as('MEMBER'))
        .expect(404);
    });
  });

  describe('profile photo', () => {
    it('uploads my avatar and a teammate can see it, but not another tenant', async () => {
      const ownerId = seed.user('A', 'OWNER');
      const res = await http()
        .put('/api/v1/users/me/avatar')
        .set('Cookie', as('OWNER'))
        .attach('file', png, { filename: 'yo.png', contentType: 'image/png' })
        .expect(200);
      expect((res.body as { avatarUrl: string | null }).avatarUrl).toContain(
        ownerId,
      );

      await http()
        .get(`/api/v1/users/${ownerId}/avatar`)
        .set('Cookie', as('VIEWER'))
        .expect(200);
      await http()
        .get(`/api/v1/users/${ownerId}/avatar`)
        .set('Cookie', as('OWNER', 'B'))
        .expect(404);
    });

    it('only accepts images', async () => {
      await http()
        .put('/api/v1/users/me/avatar')
        .set('Cookie', as('MEMBER'))
        .attach('file', pdf, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });
  });

  describe('AI integration (API key)', () => {
    let apiKey: string;
    let keyId: string;

    it('creates a key once (only an admin) and never lists it in full', async () => {
      await http()
        .post(url('/api-keys'))
        .set('Cookie', as('MEMBER'))
        .send({ name: 'Bot de IA' })
        .expect(403);

      const res = await http()
        .post(url('/api-keys'))
        .set('Cookie', as('OWNER'))
        .send({ name: 'Bot de IA' })
        .expect(201);
      const body = res.body as { id: string; key: string; prefix: string };
      expect(body.key).toMatch(/^fc_live_/);
      apiKey = body.key;
      keyId = body.id;

      const list = await http()
        .get(url('/api-keys'))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain(apiKey);
    });

    it('rejects calls without a valid key (401)', async () => {
      await http().get('/api/v1/integrations/ai/catalog').expect(401);
      await http()
        .get('/api/v1/integrations/ai/catalog')
        .set('Authorization', 'Bearer fc_live_invalid')
        .expect(401);
    });

    it('reads the catalog and creates leads only in the project of the key', async () => {
      const catalog = await http()
        .get('/api/v1/integrations/ai/catalog')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);
      expect(JSON.stringify(catalog.body)).toContain(productId);

      const res = await http()
        .post('/api/v1/integrations/ai/leads')
        .set('X-Api-Key', apiKey)
        .send({ name: 'Lead detectado por IA', phone: '+502 5555 0000' })
        .expect(201);
      const lead = res.body as { projectId: string; origin: string };
      expect(lead.projectId).toBe(seed.project('A'));
      expect(lead.origin).toBe('AI');
    });

    it('stops working right after it is revoked', async () => {
      await http()
        .delete(url(`/api-keys/${keyId}`))
        .set('Cookie', as('OWNER'))
        .expect(204);
      await http()
        .get('/api/v1/integrations/ai/catalog')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(401);
    });
  });

  describe('payments webhook', () => {
    let quoteId: string;
    let total: number;
    const secret = process.env.PAYMENTS_WEBHOOK_SECRET ?? '';

    const webhook = (payload: object, signWith = secret) => {
      const raw = Buffer.from(JSON.stringify(payload));
      return http()
        .post('/api/v1/integrations/payments/webhook')
        .set('Content-Type', 'application/json')
        .set(
          'X-FlowCommerce-Signature',
          signPaymentPayload(raw, signWith, Math.floor(Date.now() / 1000)),
        )
        .send(raw.toString('utf8'));
    };

    beforeAll(async () => {
      const created = await http()
        .post(url('/quotes'))
        .set('Cookie', as('OWNER'))
        .send({ leadId, items: [{ productId, quantity: 2 }] })
        .expect(201);
      ({ id: quoteId, total } = created.body as { id: string; total: number });
      for (const status of [
        'PENDING_APPROVAL',
        'APPROVED',
        'SENT',
        'ACCEPTED',
      ]) {
        await http()
          .patch(url(`/quotes/${quoteId}/status`))
          .set('Cookie', as('OWNER'))
          .send({ status })
          .expect(200);
      }
    });

    const event = () => ({
      eventId: `evt_${quoteId}`,
      type: 'payment.succeeded',
      projectId: seed.project('A'),
      quoteId,
      amount: total,
      reference: 'pi_e2e',
    });

    it('rejects an event signed with another secret (403)', async () => {
      await webhook(event(), 'not-the-secret').expect(403);
    });

    it('rejects a payment for another amount (409) and keeps the quote ACCEPTED', async () => {
      await webhook({
        ...event(),
        eventId: 'evt_wrong',
        amount: total + 1,
      }).expect(409);
      const quote = await http()
        .get(url(`/quotes/${quoteId}`))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect((quote.body as { status: string }).status).toBe('ACCEPTED');
    });

    it('marks the quote as PAID once, even if the event arrives twice', async () => {
      const first = await webhook(event()).expect(200);
      expect(first.body).toEqual({ received: true, result: 'PROCESSED' });
      const again = await webhook(event()).expect(200);
      expect(again.body).toEqual({ received: true, result: 'DUPLICATE' });

      const quote = await http()
        .get(url(`/quotes/${quoteId}`))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect(
        quote.body as { status: string; paidAt: string | null },
      ).toMatchObject({ status: 'PAID' });
      expect((quote.body as { paidAt: string | null }).paidAt).not.toBeNull();
    });

    it('cannot pay a quote of project A using the id of project B (404)', async () => {
      await webhook({
        ...event(),
        eventId: 'evt_cross_tenant',
        projectId: seed.project('B'),
      }).expect(404);
    });
  });
});
