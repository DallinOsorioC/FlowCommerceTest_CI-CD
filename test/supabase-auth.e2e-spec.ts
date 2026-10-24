import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { SignJWT } from 'jose';
import request from 'supertest';
import { SESSION_MANAGER } from '../src/auth/application/ports/session-manager';
import { SupabaseSessionManager } from '../src/auth/infrastructure/supabase/supabase-session.manager';
import { users } from '../src/db/schema';
import { createE2eApp, type E2eContext } from './support/e2e-app';

// La sesión REAL: el access token de Supabase Auth (JWT) en
// Authorization: Bearer, verificado por el backend y enlazado con users. Las
// demás suites simulan la sesión con una cookie; esta no.
describe('Supabase Auth session (e2e)', () => {
  let ctx: E2eContext;
  const created: string[] = [];

  const http = () => request(ctx.app.getHttpServer());
  const secret = new TextEncoder().encode(
    process.env.SUPABASE_JWT_SECRET ?? '',
  );
  const issuer = `${process.env.SUPABASE_URL}/auth/v1`;

  const tokenFor = (
    id: string,
    email: string,
    options: { exp?: string | number; iss?: string; aud?: string } = {},
  ) =>
    new SignJWT({ email, user_metadata: { name: 'Ana Torres' } })
      .setSubject(id)
      .setIssuer(options.iss ?? issuer)
      .setAudience(options.aud ?? 'authenticated')
      .setExpirationTime(options.exp ?? '1h')
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

  beforeAll(async () => {
    ctx = await createE2eApp((builder) => {
      builder
        .overrideProvider(SESSION_MANAGER)
        .useClass(SupabaseSessionManager);
    });
  });

  afterAll(async () => {
    if (created.length > 0) {
      await ctx.db.delete(users).where(inArray(users.id, created));
    }
    await ctx.close();
  });

  it('answers 401 without a token, with garbage, or with the old cookie', async () => {
    await http().get('/api/v1/auth/session').expect(401);
    await http()
      .get('/api/v1/auth/session')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    await http()
      .get('/api/v1/auth/session')
      .set('Cookie', `flowcommerce.session_token=user.${randomUUID()}`)
      .expect(401);
  });

  it('creates the local profile the first time a valid token arrives', async () => {
    const id = randomUUID();
    created.push(id);
    const email = `ana-${id}@Empresa.test`;

    const res = await http()
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${await tokenFor(id, email)}`)
      .expect(200);

    expect(res.body).toMatchObject({
      user: { id, email: email.toLowerCase(), name: 'Ana Torres' },
      session: { userId: id },
    });
    const [row] = await ctx.db.select().from(users).where(eq(users.id, id));
    expect(row.email).toBe(email.toLowerCase());
  });

  it('reuses the same profile on later requests (no duplicates)', async () => {
    const id = randomUUID();
    created.push(id);
    const token = await tokenFor(id, `repeat-${id}@empresa.test`);

    for (let i = 0; i < 3; i++) {
      await http()
        .get('/api/v1/auth/session')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
    const rows = await ctx.db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(1);
  });

  it('survives many simultaneous first requests of the same new user', async () => {
    const id = randomUUID();
    created.push(id);
    const token = await tokenFor(id, `race-${id}@empresa.test`);

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        http()
          .get('/api/v1/auth/session')
          .set('Authorization', `Bearer ${token}`),
      ),
    );

    expect(responses.map((r) => r.status)).toEqual([
      200, 200, 200, 200, 200, 200,
    ]);
    const rows = await ctx.db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(1);
  });

  it('authenticates the rest of the API with the same token', async () => {
    const id = randomUUID();
    created.push(id);

    const res = await http()
      .get('/api/v1/projects/my')
      .set(
        'Authorization',
        `Bearer ${await tokenFor(id, `me-${id}@empresa.test`)}`,
      )
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('rejects expired tokens and tokens from another project or audience', async () => {
    const id = randomUUID();
    const email = `bad-${id}@empresa.test`;
    const bad = [
      await tokenFor(id, email, { exp: Math.floor(Date.now() / 1000) - 60 }),
      await tokenFor(id, email, { iss: 'https://evil.supabase.co/auth/v1' }),
      await tokenFor(id, email, { aud: 'anon' }),
    ];

    for (const token of bad) {
      await http()
        .get('/api/v1/auth/session')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
    // Y no se creó ningún perfil.
    expect(await ctx.db.select().from(users).where(eq(users.id, id))).toEqual(
      [],
    );
  });

  it('refuses a new Supabase id whose email belongs to another local profile (no account takeover)', async () => {
    const owner = randomUUID();
    const impostor = randomUUID();
    created.push(owner);
    const email = `victim-${owner}@empresa.test`;
    await ctx.db.insert(users).values({ id: owner, name: 'Victima', email });

    await http()
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${await tokenFor(impostor, email)}`)
      .expect(401);

    expect(
      await ctx.db.select().from(users).where(eq(users.id, impostor)),
    ).toEqual([]);
  });
});
