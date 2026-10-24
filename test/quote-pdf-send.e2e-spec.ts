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

// PDF de la cotización y "Aprobar y enviar" por correo con el PDF adjunto.
describe('Quote PDF and email (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;
  let quoteId: string;
  const sent: EmailMessage[] = [];

  const http = () => request(ctx.app.getHttpServer());
  const as = (role: Role) => ctx.cookie(seed.user('A', role));
  const url = (path: string, key = 'A') =>
    `/api/v1/projects/${seed.project(key)}${path}`;
  // supertest no junta el cuerpo de un PDF por defecto: se lee como Buffer.
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
    ctx = await createE2eApp((builder) => {
      builder.overrideProvider(EMAIL_SENDER).useValue({
        send: (message: EmailMessage) => {
          sent.push(message);
          return Promise.resolve();
        },
      });
    });
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
    const post = (path: string, body: object) =>
      http().post(url(path)).set('Cookie', as('OWNER')).send(body).expect(201);
    const client = (
      (
        await post('/clients', {
          name: 'Ana Pérez',
          company: 'Constructora Ñandú',
          email: 'ana@cliente.test',
        })
      ).body as { id: string }
    ).id;
    const lead = (
      (await post('/leads', { name: 'Ana', clientId: client })).body as {
        id: string;
      }
    ).id;
    const product = (
      (await post('/products', { name: 'Diseño de oficina', price: 2500 }))
        .body as { id: string }
    ).id;
    quoteId = (
      (
        await post('/quotes', {
          leadId: lead,
          clientId: client,
          items: [{ productId: product, quantity: 2 }],
          adjustment: 100,
          notes: 'Incluye instalación',
        })
      ).body as { id: string }
    ).id;
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  it('serves the PDF to any member (VIEWER included)', async () => {
    const res = await http()
      .get(url(`/quotes/${quoteId}/pdf`))
      .set('Cookie', as('VIEWER'))
      .buffer(true)
      .parse(binary)
      .expect(200);

    expect(res.get('Content-Type')).toContain('application/pdf');
    expect(res.get('Content-Disposition')).toMatch(
      /inline; filename="COT-\d+\.pdf"/,
    );
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('answers 404 for the PDF of a quote of another project', async () => {
    await http()
      .get(url(`/quotes/${quoteId}/pdf`, 'B'))
      .set('Cookie', ctx.cookie(seed.user('B', 'OWNER')))
      .expect(404);
  });

  it('refuses to email a quote that is not approved (409)', async () => {
    await http()
      .post(url(`/quotes/${quoteId}/send`))
      .set('Cookie', as('OWNER'))
      .send({})
      .expect(409);
    expect(sent).toHaveLength(0);
  });

  it('emails the approved quote with the PDF and moves it to SENT', async () => {
    for (const status of ['PENDING_APPROVAL', 'APPROVED']) {
      await http()
        .patch(url(`/quotes/${quoteId}/status`))
        .set('Cookie', as('OWNER'))
        .send({ status })
        .expect(200);
    }

    const res = await http()
      .post(url(`/quotes/${quoteId}/send`))
      .set('Cookie', as('OWNER'))
      .send({ message: 'Adjunto la propuesta.' })
      .expect(200);

    expect((res.body as { status: string; sentAt: string }).status).toBe(
      'SENT',
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ana@cliente.test');
    expect(sent[0].text).toContain('Adjunto la propuesta.');
    expect(sent[0].attachments?.[0].contentType).toBe('application/pdf');
    expect(sent[0].attachments?.[0].content.subarray(0, 4).toString()).toBe(
      '%PDF',
    );

    // Reenviar a otra dirección no cambia el estado.
    await http()
      .post(url(`/quotes/${quoteId}/send`))
      .set('Cookie', as('OWNER'))
      .send({ to: 'compras@cliente.test' })
      .expect(200);
    expect(sent[1].to).toBe('compras@cliente.test');
  });

  it('forbids a VIEWER from sending (403)', async () => {
    await http()
      .post(url(`/quotes/${quoteId}/send`))
      .set('Cookie', as('VIEWER'))
      .send({})
      .expect(403);
  });
});
