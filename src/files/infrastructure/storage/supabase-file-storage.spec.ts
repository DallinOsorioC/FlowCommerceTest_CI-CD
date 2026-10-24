import { ConfigService } from '@nestjs/config';
import { StoredFileNotFoundError } from '../../domain/file-storage';
import { SupabaseFileStorage } from './supabase-file-storage';

describe('SupabaseFileStorage', () => {
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://abcd.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_STORAGE_BUCKET: 'uploads',
  };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const reply = (status: number, body = '') =>
    Promise.resolve(new Response(body || null, { status }));

  const key = 'projects/p1/attachments/3f2a.pdf';

  it('uploads to the private bucket with the service key and never overwrites', async () => {
    const fetchImpl = jest.fn().mockReturnValue(reply(200));
    const storage = new SupabaseFileStorage(config, fetchImpl);

    await storage.save(key, Buffer.from('%PDF'));

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://abcd.supabase.co/storage/v1/object/uploads/projects/p1/attachments/3f2a.pdf',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer service-key',
      'x-upsert': 'false',
    });
  });

  it('fails loudly when the upload is rejected', async () => {
    const storage = new SupabaseFileStorage(
      config,
      jest.fn().mockReturnValue(reply(403)),
    );
    await expect(storage.save(key, Buffer.from('x'))).rejects.toThrow(
      'HTTP 403',
    );
  });

  it('reads the same bytes back', async () => {
    const storage = new SupabaseFileStorage(
      config,
      jest.fn().mockReturnValue(reply(200, 'contenido')),
    );
    await expect(storage.read(key)).resolves.toEqual(Buffer.from('contenido'));
  });

  it('maps a missing object to StoredFileNotFoundError (404 or 400)', async () => {
    for (const status of [404, 400]) {
      const storage = new SupabaseFileStorage(
        config,
        jest.fn().mockReturnValue(reply(status, '{"error":"not_found"}')),
      );
      await expect(storage.read(key)).rejects.toBeInstanceOf(
        StoredFileNotFoundError,
      );
    }
  });

  it('does not treat a server error as "not found"', async () => {
    const storage = new SupabaseFileStorage(
      config,
      jest.fn().mockReturnValue(reply(500)),
    );
    await expect(storage.read(key)).rejects.toThrow('HTTP 500');
  });

  it('removing a file that is already gone is not an error', async () => {
    const storage = new SupabaseFileStorage(
      config,
      jest.fn().mockReturnValue(reply(404)),
    );
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('rejects keys that could escape the bucket path', async () => {
    const fetchImpl = jest.fn();
    const storage = new SupabaseFileStorage(config, fetchImpl);
    for (const bad of ['../secret', 'a/../b', 'a b']) {
      await expect(storage.read(bad)).rejects.toThrow('Invalid storage key');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to start without the Supabase credentials', () => {
    expect(
      () =>
        new SupabaseFileStorage({
          get: () => undefined,
        } as unknown as ConfigService),
    ).toThrow('SUPABASE_URL');
  });
});
