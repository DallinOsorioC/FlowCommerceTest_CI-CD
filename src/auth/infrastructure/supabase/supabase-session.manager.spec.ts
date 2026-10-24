/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import type { UserEntity } from '../../../users/domain/entities/user.entity';
import type { UserRepository } from '../../../users/domain/repositories/user.repository';
import { SupabaseSessionManager } from './supabase-session.manager';
import type {
  SupabaseClaims,
  SupabaseJwtVerifier,
} from './supabase-jwt.verifier';

describe('SupabaseSessionManager', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const claims: SupabaseClaims = {
    userId: USER_ID,
    email: 'Ana@Empresa.com',
    name: 'Ana Torres',
    emailVerified: true,
    sessionId: 'sess-1',
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
  };
  const entity = (id = USER_ID): UserEntity =>
    ({
      id,
      name: 'Ana Torres',
      email: 'ana@empresa.com',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    }) as UserEntity;

  const verifier = {
    verify: jest.fn(),
  } as unknown as jest.Mocked<SupabaseJwtVerifier>;
  const users = {
    findById: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<UserRepository>;
  const manager = new SupabaseSessionManager(verifier, users);

  const withToken = (token?: string) =>
    new Headers(token ? { authorization: `Bearer ${token}` } : {});

  beforeEach(() => {
    jest.resetAllMocks();
    verifier.verify.mockResolvedValue(claims);
  });

  it('returns no session without a bearer token, never touching the verifier', async () => {
    await expect(manager.getSession(withToken())).resolves.toBeNull();
    await expect(
      manager.getSession(new Headers({ authorization: 'Basic abc' })),
    ).resolves.toBeNull();
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('returns no session for an invalid token', async () => {
    verifier.verify.mockResolvedValue(null);
    await expect(manager.getSession(withToken('bad'))).resolves.toBeNull();
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('maps a valid token to the existing local profile (same id)', async () => {
    users.findById.mockResolvedValue(entity());

    const session = await manager.getSession(withToken('ok'));

    expect(users.findById).toHaveBeenCalledWith(USER_ID);
    expect(users.create).not.toHaveBeenCalled();
    expect(session).toMatchObject({
      user: { id: USER_ID, email: 'ana@empresa.com' },
      session: {
        id: 'sess-1',
        userId: USER_ID,
        expiresAt: claims.expiresAt,
      },
    });
  });

  it('creates the profile on first sight, with the Supabase id and a lowercase email', async () => {
    users.findById.mockResolvedValue(null);
    users.create.mockResolvedValue(entity());

    await manager.getSession(withToken('ok'));

    expect(users.create).toHaveBeenCalledWith({
      id: USER_ID,
      name: 'Ana Torres',
      email: 'ana@empresa.com',
    });
  });

  it('names a profile after the email prefix when the token carries no name', async () => {
    verifier.verify.mockResolvedValue({ ...claims, name: null });
    users.findById.mockResolvedValue(null);
    users.create.mockResolvedValue(entity());

    await manager.getSession(withToken('ok'));

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ana' }),
    );
  });

  it('survives two simultaneous first requests (unique violation, the winner is read)', async () => {
    users.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(entity());
    users.create.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );

    await expect(manager.getSession(withToken('ok'))).resolves.toMatchObject({
      session: { userId: USER_ID },
    });
  });

  it('rejects a new Supabase id whose email already belongs to ANOTHER local profile', async () => {
    users.findById.mockResolvedValue(null);
    users.create.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );

    await expect(manager.getSession(withToken('ok'))).resolves.toBeNull();
  });

  it('does not hide unexpected database errors', async () => {
    users.findById.mockResolvedValue(null);
    users.create.mockRejectedValue(new Error('connection lost'));

    await expect(manager.getSession(withToken('ok'))).rejects.toThrow(
      'connection lost',
    );
  });
});
