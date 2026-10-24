import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '../../../common/exceptions/domain.exceptions';
import { SupabaseIdentityAdmin } from './supabase-identity.admin';

describe('SupabaseIdentityAdmin', () => {
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://abcd.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    APP_URL: 'https://app.flowcommerce.com',
  };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const json = (status: number, body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  it('invites by email with the service key and returns the new id', async () => {
    const fetchImpl = jest
      .fn()
      .mockReturnValue(json(200, { id: 'user-1', email: 'ana@empresa.com' }));

    const result = await new SupabaseIdentityAdmin(
      config,
      fetchImpl,
    ).inviteByEmail({
      email: 'ana@empresa.com',
      name: 'Ana',
    });

    expect(result).toEqual({ id: 'user-1', alreadyExisted: false });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://abcd.supabase.co/auth/v1/invite?redirect_to=https%3A%2F%2Fapp.flowcommerce.com',
    );
    expect(init.headers).toMatchObject({ Authorization: 'Bearer service-key' });
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'ana@empresa.com',
      data: { name: 'Ana' },
    });
  });

  it('reuses the id of an account that already exists in Supabase, without inviting again', async () => {
    const fetchImpl = jest
      .fn()
      .mockReturnValueOnce(json(422, { error_code: 'email_exists', msg: 'x' }))
      .mockReturnValueOnce(json(200, { id: 'user-9' }));

    const result = await new SupabaseIdentityAdmin(
      config,
      fetchImpl,
    ).inviteByEmail({
      email: 'ana@empresa.com',
      name: 'Ana',
    });

    expect(result).toEqual({ id: 'user-9', alreadyExisted: true });
    expect((fetchImpl.mock.calls[1] as [string])[0]).toContain(
      '/auth/v1/admin/generate_link',
    );
  });

  it('fails with 502 on any other Supabase error', async () => {
    const fetchImpl = jest.fn().mockReturnValue(json(500, { msg: 'boom' }));
    await expect(
      new SupabaseIdentityAdmin(config, fetchImpl).inviteByEmail({
        email: 'a@b.co',
        name: 'A',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fails with 503 when Supabase is not configured', async () => {
    const admin = new SupabaseIdentityAdmin(
      { get: () => undefined } as unknown as ConfigService,
      jest.fn(),
    );
    await expect(
      admin.inviteByEmail({ email: 'a@b.co', name: 'A' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates a confirmed user with a given id (seed)', async () => {
    const fetchImpl = jest.fn().mockReturnValue(json(200, { id: 'fixed-id' }));

    await new SupabaseIdentityAdmin(config, fetchImpl).createConfirmedUser({
      id: 'fixed-id',
      email: 'seed@x.local',
      password: 'pw',
      name: 'Seed',
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://abcd.supabase.co/auth/v1/admin/users');
    expect(JSON.parse(init.body as string)).toMatchObject({
      id: 'fixed-id',
      email_confirm: true,
    });
  });
});
