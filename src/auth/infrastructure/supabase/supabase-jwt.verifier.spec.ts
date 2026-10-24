import { ConfigService } from '@nestjs/config';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from 'jose';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier';

const URL_ = 'https://abcd.supabase.co';
const SECRET = 'a-shared-secret-of-at-least-32-characters!!';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('SupabaseJwtVerifier', () => {
  let privateKey: KeyLike;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
  });

  const claims = (extra: Record<string, unknown> = {}) => ({
    email: 'ana@empresa.com',
    session_id: 'sess-1',
    user_metadata: { name: 'Ana Torres', email_verified: true },
    ...extra,
  });

  const baseJwt = (extra: Record<string, unknown> = {}) =>
    new SignJWT(claims(extra))
      .setSubject(USER_ID)
      .setIssuer(`${URL_}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h');

  const es256 = (jwt = baseJwt()) =>
    jwt.setProtectedHeader({ alg: 'ES256', kid: 'k1' }).sign(privateKey);
  const hs256 = (jwt = baseJwt(), secret = SECRET) =>
    jwt
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(secret));

  const verifier = (env: Record<string, string | undefined> = {}) =>
    new SupabaseJwtVerifier(
      config({ SUPABASE_URL: URL_, SUPABASE_JWT_SECRET: SECRET, ...env }),
      createLocalJWKSet({ keys: [jwk] }),
    );

  it('accepts an asymmetric (JWKS) token and reads the claims', async () => {
    const result = await verifier().verify(await es256());

    expect(result).toMatchObject({
      userId: USER_ID,
      email: 'ana@empresa.com',
      name: 'Ana Torres',
      emailVerified: true,
      sessionId: 'sess-1',
    });
    expect(result?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts the legacy shared-secret (HS256) token', async () => {
    await expect(verifier().verify(await hs256())).resolves.toMatchObject({
      userId: USER_ID,
    });
  });

  it('rejects an HS256 token when no shared secret is configured', async () => {
    await expect(
      verifier({ SUPABASE_JWT_SECRET: undefined }).verify(await hs256()),
    ).resolves.toBeNull();
  });

  it('rejects a wrong signature (forged token)', async () => {
    await expect(
      verifier().verify(
        await hs256(baseJwt(), 'another-secret-also-32-characters-long!'),
      ),
    ).resolves.toBeNull();
    const other = await generateKeyPair('ES256');
    const forged = await baseJwt()
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .sign(other.privateKey);
    await expect(verifier().verify(forged)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = await baseJwt()
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    await expect(verifier().verify(expired)).resolves.toBeNull();
  });

  it('rejects a token from another project or another audience', async () => {
    const otherIssuer = await new SignJWT(claims())
      .setSubject(USER_ID)
      .setIssuer('https://evil.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .sign(privateKey);
    const otherAudience = await new SignJWT(claims())
      .setSubject(USER_ID)
      .setIssuer(`${URL_}/auth/v1`)
      .setAudience('anon')
      .setExpirationTime('1h')
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .sign(privateKey);

    await expect(verifier().verify(otherIssuer)).resolves.toBeNull();
    await expect(verifier().verify(otherAudience)).resolves.toBeNull();
  });

  it('rejects alg "none" and garbage', async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: USER_ID, email: 'a@b.co', exp: 9999999999 }),
    ).toString('base64url')}.`;

    await expect(verifier().verify(none)).resolves.toBeNull();
    await expect(verifier().verify('not.a.jwt')).resolves.toBeNull();
    await expect(verifier().verify('')).resolves.toBeNull();
  });

  it('rejects a token that lacks sub or email', async () => {
    const noEmail = await new SignJWT({})
      .setSubject(USER_ID)
      .setIssuer(`${URL_}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .sign(privateKey);
    await expect(verifier().verify(noEmail)).resolves.toBeNull();
  });

  it('refuses everything when SUPABASE_URL is not configured (fail-closed)', async () => {
    await expect(
      verifier({ SUPABASE_URL: undefined }).verify(await es256()),
    ).resolves.toBeNull();
  });

  it('falls back to the email prefix handling in the session layer: name may be absent', async () => {
    const token = await new SignJWT({ email: 'ana@empresa.com' })
      .setSubject(USER_ID)
      .setIssuer(`${URL_}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .sign(privateKey);
    const result = await verifier().verify(token);
    expect(result?.name).toBeNull();
    expect(result?.sessionId).toBe(USER_ID);
  });
});
