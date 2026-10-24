import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { leads, messages, whatsappAccounts } from '../src/db/schema';
import { signWhatsAppPayload } from '../src/messages/infrastructure/whatsapp/whatsapp-webhook.signature';
import { verifyWebhookSignature } from '../src/webhooks/domain/signing';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

// WhatsApp por proyecto (token cifrado), plantillas, respuestas rápidas,
// scopes de API keys y webhooks salientes. Lo de Meta va en modo dry-run: no
// sale ninguna llamada a Graph.
describe('WhatsApp config, quick replies, scopes and webhooks (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  const http = () => request(ctx.app.getHttpServer());
  const as = (role: Role, key = 'A') => ctx.cookie(seed.user(key, role));
  const url = (path: string, key = 'A') =>
    `/api/v1/projects/${seed.project(key)}${path}`;

  // Receptor de webhooks de mentira.
  interface Received {
    headers: IncomingHttpHeaders;
    body: string;
  }
  let receiver: Server;
  let receiverUrl: string;
  let received: Received[] = [];
  let receiverStatus = 200;

  const waitFor = async (predicate: () => boolean, ms = 4000) => {
    const deadline = Date.now() + ms;
    while (!predicate() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return predicate();
  };

  beforeAll(async () => {
    process.env.WHATSAPP_TEMPLATES_DRY_RUN = 'true';
    process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS = 'true';
    process.env.WEBHOOKS_RETRY_BASE_MS = '1';

    receiver = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        received.push({
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        res.statusCode = receiverStatus;
        res.end();
      });
    });
    await new Promise<void>((resolve) =>
      receiver.listen(0, '127.0.0.1', resolve),
    );
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;

    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
    await new Promise((resolve) => receiver.close(resolve));
    delete process.env.WHATSAPP_TEMPLATES_DRY_RUN;
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS;
    delete process.env.WEBHOOKS_RETRY_BASE_MS;
  });

  describe('WhatsApp connection per project', () => {
    const token = 'EAAG-super-secret-token-9876';

    it('starts disconnected and only admins can read it', async () => {
      await http()
        .get(url('/whatsapp/config'))
        .set('Cookie', as('MEMBER'))
        .expect(403);
      const res = await http()
        .get(url('/whatsapp/config'))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect(res.body).toMatchObject({ connected: false, source: 'none' });
    });

    it('saves the token encrypted and never returns it', async () => {
      await http()
        .put(url('/whatsapp/config'))
        .set('Cookie', as('MEMBER'))
        .send({ phoneNumberId: '555000111', token })
        .expect(403);

      const res = await http()
        .put(url('/whatsapp/config'))
        .set('Cookie', as('OWNER'))
        .send({
          phoneNumberId: '555000111',
          businessAccountId: '777000222',
          token,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        connected: true,
        source: 'project',
        phoneNumberId: '555000111',
        tokenLast4: '9876',
      });
      expect(JSON.stringify(res.body)).not.toContain(token);

      const get = await http()
        .get(url('/whatsapp/config'))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect(JSON.stringify(get.body)).not.toContain(token);

      const [row] = await ctx.db
        .select()
        .from(whatsappAccounts)
        .where(eq(whatsappAccounts.projectId, seed.project('A')));
      expect(row.tokenEncrypted).not.toContain(token);
      expect(row.tokenEncrypted.startsWith('v1:')).toBe(true);
    });

    it('refreshes updatedAt when the account is replaced', async () => {
      const before = (
        await http()
          .get(url('/whatsapp/config'))
          .set('Cookie', as('OWNER'))
          .expect(200)
      ).body as { updatedAt: string };
      await new Promise((resolve) => setTimeout(resolve, 20));

      const after = (
        await http()
          .put(url('/whatsapp/config'))
          .set('Cookie', as('OWNER'))
          .send({
            phoneNumberId: '555000111',
            token: 'EAAG-rotated-token-5555',
          })
          .expect(200)
      ).body as { updatedAt: string; tokenLast4: string };

      expect(after.tokenLast4).toBe('5555');
      expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(
        new Date(before.updatedAt).getTime(),
      );
      // Se restaura el token original para el resto de las pruebas.
      await http()
        .put(url('/whatsapp/config'))
        .set('Cookie', as('OWNER'))
        .send({
          phoneNumberId: '555000111',
          businessAccountId: '777000222',
          token,
        })
        .expect(200);
    });

    it('does not let another project reuse the same phone number (409)', async () => {
      await http()
        .put(url('/whatsapp/config', 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .send({ phoneNumberId: '555000111', token: 'other-token' })
        .expect(409);
    });

    describe('inbound webhook routed by phone_number_id', () => {
      const inboundFrom = (phoneNumberId: string, wamid: string) => ({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: phoneNumberId },
                  contacts: [
                    { wa_id: '50255550000', profile: { name: 'Cliente Web' } },
                  ],
                  messages: [
                    {
                      from: '50255550000',
                      id: wamid,
                      type: 'text',
                      text: { body: 'Hola, quiero una cotización' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      const post = (payload: object) => {
        const raw = Buffer.from(JSON.stringify(payload));
        return http()
          .post('/api/v1/webhooks/whatsapp')
          .set(
            'X-Hub-Signature-256',
            signWhatsAppPayload(raw, process.env.WHATSAPP_APP_SECRET ?? ''),
          )
          .set('Content-Type', 'application/json')
          .send(raw.toString('utf8'))
          .expect(200);
      };
      const messagesOf = (wamid: string) =>
        ctx.db
          .select()
          .from(messages)
          .where(eq(messages.whatsappMessageId, wamid));

      it('stores the message in the project that owns the number', async () => {
        await post(inboundFrom('555000111', 'wamid.e2e-routed-1'));

        const [row] = await messagesOf('wamid.e2e-routed-1');
        expect(row.projectId).toBe(seed.project('A'));
        const [lead] = await ctx.db
          .select()
          .from(leads)
          .where(eq(leads.id, row.leadId));
        expect(lead.projectId).toBe(seed.project('A'));
        expect(lead.name).toBe('Cliente Web');
      });

      it('drops a message for a number no project owns', async () => {
        await post(inboundFrom('999888777', 'wamid.e2e-orphan-1'));
        expect(await messagesOf('wamid.e2e-orphan-1')).toHaveLength(0);
      });

      it('stops routing once the project disconnects its number', async () => {
        await http()
          .delete(url('/whatsapp/config'))
          .set('Cookie', as('OWNER'))
          .expect(204);
        await post(inboundFrom('555000111', 'wamid.e2e-after-1'));
        expect(await messagesOf('wamid.e2e-after-1')).toHaveLength(0);

        // Se vuelve a conectar para el resto de las pruebas.
        await http()
          .put(url('/whatsapp/config'))
          .set('Cookie', as('OWNER'))
          .send({
            phoneNumberId: '555000111',
            businessAccountId: '777000222',
            token,
          })
          .expect(200);
      });
    });

    it('does not let a user of another project touch this one (403)', async () => {
      await http()
        .get(url('/whatsapp/config'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(403);
      await http()
        .delete(url('/whatsapp/config'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(403);
    });

    it('rejects a malformed phone number id (400)', async () => {
      await http()
        .put(url('/whatsapp/config'))
        .set('Cookie', as('OWNER'))
        .send({ phoneNumberId: 'abc', token })
        .expect(400);
    });

    it('disconnects, and a second disconnect is a 404', async () => {
      await http()
        .delete(url('/whatsapp/config'))
        .set('Cookie', as('OWNER'))
        .expect(204);
      await http()
        .delete(url('/whatsapp/config'))
        .set('Cookie', as('OWNER'))
        .expect(404);
    });
  });

  describe('WhatsApp templates (dry-run)', () => {
    const template = {
      name: 'seguimiento_cotizacion',
      language: 'es',
      category: 'UTILITY',
      bodyText: 'Hola {{1}}, su cotización {{2}} sigue vigente.',
      bodyExamples: ['Ana', 'COT-0012'],
    };

    it('submits a template without calling Meta', async () => {
      const res = await http()
        .post(url('/whatsapp/templates'))
        .set('Cookie', as('OWNER'))
        .send(template)
        .expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING' });
      expect((res.body as { id: string }).id).toMatch(/^dry-run-/);
    });

    it('only admins can create or delete (403)', async () => {
      await http()
        .post(url('/whatsapp/templates'))
        .set('Cookie', as('MEMBER'))
        .send(template)
        .expect(403);
      await http()
        .delete(url('/whatsapp/templates?name=seguimiento_cotizacion'))
        .set('Cookie', as('MEMBER'))
        .expect(403);
    });

    it('validates name and variable examples (400)', async () => {
      await http()
        .post(url('/whatsapp/templates'))
        .set('Cookie', as('OWNER'))
        .send({ ...template, name: 'Nombre Con Espacios' })
        .expect(400);
      await http()
        .post(url('/whatsapp/templates'))
        .set('Cookie', as('OWNER'))
        .send({ ...template, bodyExamples: ['Ana'] })
        .expect(400);
      await http()
        .delete(url('/whatsapp/templates'))
        .set('Cookie', as('OWNER'))
        .expect(400);
    });

    it('deletes by name', async () => {
      await http()
        .delete(url('/whatsapp/templates?name=seguimiento_cotizacion'))
        .set('Cookie', as('OWNER'))
        .expect(204);
    });
  });

  describe('quick replies', () => {
    let replyId: string;

    it('lets a MEMBER create one, normalizing the shortcut', async () => {
      const res = await http()
        .post(url('/quick-replies'))
        .set('Cookie', as('MEMBER'))
        .send({
          shortcut: '/Saludo',
          title: 'Saludo',
          content: 'Hola, ¿en qué le ayudo?',
        })
        .expect(201);
      expect(res.body).toMatchObject({ shortcut: 'saludo' });
      replyId = (res.body as { id: string }).id;
    });

    it('rejects a duplicate shortcut (409) and a bad one (400)', async () => {
      await http()
        .post(url('/quick-replies'))
        .set('Cookie', as('OWNER'))
        .send({ shortcut: 'saludo', title: 'Otro', content: 'x' })
        .expect(409);
      await http()
        .post(url('/quick-replies'))
        .set('Cookie', as('OWNER'))
        .send({ shortcut: 'con espacio', title: 'Otro', content: 'x' })
        .expect(400);
    });

    it('lets a VIEWER neither read nor write (403)', async () => {
      await http()
        .get(url('/quick-replies'))
        .set('Cookie', as('VIEWER'))
        .expect(403);
      await http()
        .post(url('/quick-replies'))
        .set('Cookie', as('VIEWER'))
        .send({ shortcut: 'x', title: 'x', content: 'x' })
        .expect(403);
    });

    it('isolates tenants: B sees nothing and cannot edit or delete A’s reply', async () => {
      const list = await http()
        .get(url('/quick-replies', 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(200);
      expect(list.body).toEqual([]);

      await http()
        .patch(url(`/quick-replies/${replyId}`, 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .send({ title: 'hackeado' })
        .expect(404);
      await http()
        .delete(url(`/quick-replies/${replyId}`, 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(404);
    });

    it('edits and deletes in its own project', async () => {
      const patched = await http()
        .patch(url(`/quick-replies/${replyId}`))
        .set('Cookie', as('MEMBER'))
        .send({ content: 'Hola de nuevo' })
        .expect(200);
      expect(patched.body).toMatchObject({ content: 'Hola de nuevo' });
      await http()
        .delete(url(`/quick-replies/${replyId}`))
        .set('Cookie', as('MEMBER'))
        .expect(204);
    });
  });

  describe('API key scopes', () => {
    const create = async (body: object) =>
      (
        await http()
          .post(url('/api-keys'))
          .set('Cookie', as('OWNER'))
          .send(body)
          .expect(201)
      ).body as { key: string; scopes: string[] };

    it('a key without scopes gets all of them', async () => {
      const { scopes } = await create({ name: 'Completa' });
      expect(scopes.sort()).toEqual(
        ['catalog:read', 'leads:read', 'leads:write', 'quotes:write'].sort(),
      );
    });

    it('a read-only key reads but cannot write (403, not 401)', async () => {
      const { key, scopes } = await create({
        name: 'Solo catálogo',
        scopes: ['catalog:read'],
      });
      expect(scopes).toEqual(['catalog:read']);

      await http()
        .get('/api/v1/integrations/ai/catalog')
        .set('Authorization', `Bearer ${key}`)
        .expect(200);
      await http()
        .post('/api/v1/integrations/ai/leads')
        .set('Authorization', `Bearer ${key}`)
        .send({ name: 'No debería crearse' })
        .expect(403);
    });

    it('rejects unknown or empty scopes at creation (400)', async () => {
      await http()
        .post(url('/api-keys'))
        .set('Cookie', as('OWNER'))
        .send({ name: 'x', scopes: ['admin:everything'] })
        .expect(400);
      await http()
        .post(url('/api-keys'))
        .set('Cookie', as('OWNER'))
        .send({ name: 'x', scopes: [] })
        .expect(400);
    });
  });

  describe('outbound webhooks', () => {
    let webhookId: string;
    let secret: string;

    beforeEach(() => {
      received = [];
      receiverStatus = 200;
    });

    it('only admins manage them (403)', async () => {
      await http()
        .post(url('/webhooks'))
        .set('Cookie', as('MEMBER'))
        .send({ url: receiverUrl, events: ['*'] })
        .expect(403);
      await http()
        .get(url('/webhooks'))
        .set('Cookie', as('VIEWER'))
        .expect(403);
    });

    it('registers one and shows the secret only once', async () => {
      const res = await http()
        .post(url('/webhooks'))
        .set('Cookie', as('OWNER'))
        .send({ url: receiverUrl, events: ['lead.created'] })
        .expect(201);
      const body = res.body as { id: string; secret: string };
      expect(body.secret).toMatch(/^whsec_/);
      webhookId = body.id;
      secret = body.secret;

      const list = await http()
        .get(url('/webhooks'))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain(secret);
    });

    it('rejects unknown events and a missing subscription (400)', async () => {
      await http()
        .post(url('/webhooks'))
        .set('Cookie', as('OWNER'))
        .send({ url: receiverUrl, events: ['lead.exploded'] })
        .expect(400);
      await http()
        .post(url('/webhooks'))
        .set('Cookie', as('OWNER'))
        .send({ url: receiverUrl, events: [] })
        .expect(400);
    });

    it('sends a signed ping the receiver can verify', async () => {
      const res = await http()
        .post(url(`/webhooks/${webhookId}/test`))
        .set('Cookie', as('OWNER'))
        .expect(200);
      expect(res.body).toMatchObject({ status: 'SUCCESS', attempts: 1 });

      expect(received).toHaveLength(1);
      const [hit] = received;
      expect(hit.headers['x-flowcommerce-event']).toBe('ping');
      expect(
        verifyWebhookSignature(
          secret,
          hit.headers['x-flowcommerce-signature'] as string,
          hit.body,
          Math.floor(Date.now() / 1000),
        ),
      ).toBe(true);
    });

    it('delivers lead.created and only to its own project', async () => {
      await http()
        .post(url('/leads'))
        .set('Cookie', as('OWNER'))
        .send({ name: 'Ana Torres', email: 'ana@cliente.test' })
        .expect(201);
      expect(await waitFor(() => received.length === 1)).toBe(true);
      const payload = JSON.parse(received[0].body) as {
        event: string;
        projectId: string;
      };
      expect(payload).toMatchObject({
        event: 'lead.created',
        projectId: seed.project('A'),
      });

      // Un lead de B no le llega al webhook de A.
      received = [];
      await http()
        .post(url('/leads', 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .send({ name: 'Lead de B', email: 'b@cliente.test' })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(received).toHaveLength(0);
    });

    it('does not send events it is not subscribed to', async () => {
      await http()
        .post(url('/clients'))
        .set('Cookie', as('OWNER'))
        .send({ name: 'Cliente Sin Evento' })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(received).toHaveLength(0);
    });

    it('keeps a delivery log, including failed attempts', async () => {
      receiverStatus = 500;
      const res = await http()
        .post(url(`/webhooks/${webhookId}/test`))
        .set('Cookie', as('OWNER'))
        .expect(200);
      // «Probar» hace un solo intento; los reintentos del envío real están
      // cubiertos en webhook-dispatcher.spec.ts.
      expect(res.body).toMatchObject({
        status: 'FAILED',
        attempts: 1,
        responseStatus: 500,
      });

      const log = await http()
        .get(url(`/webhooks/${webhookId}/deliveries`))
        .set('Cookie', as('OWNER'))
        .expect(200);
      const rows = log.body as { status: string; attempts: number }[];
      expect(rows[0]).toMatchObject({ status: 'FAILED', attempts: 1 });
      expect(rows.some((row) => row.status === 'SUCCESS')).toBe(true);
    });

    it('rotates the secret: the old signature stops verifying', async () => {
      const res = await http()
        .post(url(`/webhooks/${webhookId}/rotate-secret`))
        .set('Cookie', as('OWNER'))
        .expect(200);
      const next = (res.body as { secret: string }).secret;
      expect(next).not.toBe(secret);

      await http()
        .post(url(`/webhooks/${webhookId}/test`))
        .set('Cookie', as('OWNER'))
        .expect(200);
      const [hit] = received;
      const header = hit.headers['x-flowcommerce-signature'] as string;
      const now = Math.floor(Date.now() / 1000);
      expect(verifyWebhookSignature(next, header, hit.body, now)).toBe(true);
      expect(verifyWebhookSignature(secret, header, hit.body, now)).toBe(false);
    });

    it('a paused webhook receives nothing', async () => {
      await http()
        .patch(url(`/webhooks/${webhookId}`))
        .set('Cookie', as('OWNER'))
        .send({ active: false })
        .expect(200);
      await http()
        .post(url('/leads'))
        .set('Cookie', as('OWNER'))
        .send({ name: 'Con webhook pausado', email: 'p@cliente.test' })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(received).toHaveLength(0);
    });

    it('is invisible and untouchable from another project (404)', async () => {
      const list = await http()
        .get(url('/webhooks', 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(200);
      expect(list.body).toEqual([]);
      await http()
        .patch(url(`/webhooks/${webhookId}`, 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .send({ active: true })
        .expect(404);
      await http()
        .post(url(`/webhooks/${webhookId}/test`, 'B'))
        .set('Cookie', as('OWNER', 'B'))
        .expect(404);
    });

    it('blocks internal targets when private targets are not allowed (SSRF)', async () => {
      process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS = 'false';
      try {
        for (const target of [
          'https://169.254.169.254/latest/meta-data',
          'https://127.0.0.1/hook',
          'http://example.com/hook',
          'https://user:pass@example.com/hook',
        ]) {
          await http()
            .post(url('/webhooks'))
            .set('Cookie', as('OWNER'))
            .send({ url: target, events: ['*'] })
            .expect(400);
        }
      } finally {
        process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS = 'true';
      }
    });

    it('deletes the webhook', async () => {
      await http()
        .delete(url(`/webhooks/${webhookId}`))
        .set('Cookie', as('OWNER'))
        .expect(204);
      await http()
        .delete(url(`/webhooks/${webhookId}`))
        .set('Cookie', as('OWNER'))
        .expect(404);
    });
  });
});
