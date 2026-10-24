import request from 'supertest';
import { createE2eApp, type E2eContext } from './support/e2e-app';

// M2: los endpoints públicos tienen límite de peticiones por IP. Aquí se
// activan con límites bajos (en las demás suites están desactivados).
describe('Rate limiting (e2e)', () => {
  let ctx: E2eContext;
  const previous = { ...process.env };

  beforeAll(async () => {
    process.env.THROTTLE_ENABLED = 'true';
    process.env.THROTTLE_ACCESS_REQUEST_LIMIT = '2';
    process.env.THROTTLE_ACCESS_REQUEST_TTL_MS = '60000';
    ctx = await createE2eApp();
  });

  afterAll(async () => {
    process.env = previous;
    await ctx.close();
  });

  it('answers 429 once the access-request limit is exceeded, with the usual error format', async () => {
    const solicitar = () =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/auth/access-requests')
        .send({});

    // El guard corre antes que la validación: las dos primeras llegan al
    // ValidationPipe (400) y la tercera ya se corta con 429.
    await solicitar().expect(400);
    await solicitar().expect(400);
    const blocked = await solicitar().expect(429);

    expect(blocked.body).toMatchObject({
      statusCode: 429,
      path: '/api/v1/auth/access-requests',
    });
  });

  it('does not limit authenticated endpoints', async () => {
    for (let i = 0; i < 5; i++) {
      await request(ctx.app.getHttpServer()).get('/api/v1/health').expect(200);
    }
  });
});
