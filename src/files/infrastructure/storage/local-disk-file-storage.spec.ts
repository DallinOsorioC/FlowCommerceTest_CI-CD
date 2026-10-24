import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { StoredFileNotFoundError } from '../../domain/file-storage';
import {
  createFileStorage,
  resolveFileStorageDriver,
} from './create-file-storage';
import { LocalDiskFileStorage } from './local-disk-file-storage';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('LocalDiskFileStorage', () => {
  let dir: string;
  let storage: LocalDiskFileStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fc-uploads-'));
    storage = new LocalDiskFileStorage(config({ UPLOADS_DIR: dir }));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves, reads and removes a file inside the uploads folder', async () => {
    const key = 'projects/p1/attachments/a.pdf';
    await storage.save(key, Buffer.from('%PDF-1.7'));

    await expect(storage.read(key)).resolves.toEqual(Buffer.from('%PDF-1.7'));
    await storage.remove(key);
    await expect(storage.read(key)).rejects.toBeInstanceOf(
      StoredFileNotFoundError,
    );
    // Borrar algo que ya no existe no falla.
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('never overwrites an existing file', async () => {
    await storage.save('k.txt', Buffer.from('1'));
    await expect(storage.save('k.txt', Buffer.from('2'))).rejects.toThrow();
    await expect(storage.read('k.txt')).resolves.toEqual(Buffer.from('1'));
  });

  it('refuses keys that try to leave the uploads folder', async () => {
    await expect(
      storage.save('../escape.txt', Buffer.from('x')),
    ).rejects.toThrow(/Invalid storage key/);
    await expect(storage.read('/etc/passwd')).rejects.toThrow(
      /Invalid storage key/,
    );
  });
});

describe('createFileStorage', () => {
  it('uses the local disk by default and when FILE_STORAGE_DRIVER=local', () => {
    expect(resolveFileStorageDriver(undefined)).toBe('local');
    expect(resolveFileStorageDriver(' LOCAL ')).toBe('local');
    expect(
      createFileStorage(config({ FILE_STORAGE_DRIVER: 'local' })),
    ).toBeInstanceOf(LocalDiskFileStorage);
  });

  it('stops the start-up with a clear message for an unknown driver', () => {
    expect(() => resolveFileStorageDriver('s3')).toThrow(
      'FILE_STORAGE_DRIVER="s3" is not supported. Available: local',
    );
  });
});
