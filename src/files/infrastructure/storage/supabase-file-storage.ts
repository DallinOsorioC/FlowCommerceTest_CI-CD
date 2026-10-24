import { ConfigService } from '@nestjs/config';
import {
  StoredFileNotFoundError,
  type FileStorage,
} from '../../domain/file-storage';

// Mismas claves válidas que el disco local: el servidor las genera y nunca
// llevan "..".
const SAFE_KEY = /^[a-z0-9][a-z0-9/._-]*$/i;
const TIMEOUT_MS = 20_000;

// Almacenamiento en Supabase Storage (bucket PRIVADO). El backend habla con
// la API REST usando la service-role key, que se salta las políticas del
// bucket y NUNCA debe llegar al navegador: los archivos salen siempre por
// esta API, que revisa el proyecto del usuario antes de servirlos.
//
//   SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...
//   SUPABASE_STORAGE_BUCKET=uploads   (créalo como privado)
export class SupabaseFileStorage implements FileStorage {
  private readonly baseUrl: string;
  private readonly bucket: string;
  private readonly serviceKey: string;

  constructor(
    configService: ConfigService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const url = configService.get<string>('SUPABASE_URL');
    const key = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      throw new Error(
        'FILE_STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    this.baseUrl = `${url.replace(/\/$/, '')}/storage/v1/object`;
    this.bucket =
      configService.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'uploads';
    this.serviceKey = key;
  }

  async save(key: string, content: Buffer): Promise<void> {
    const response = await this.request('POST', key, {
      body: new Uint8Array(content),
      headers: {
        'Content-Type': 'application/octet-stream',
        // Nunca pisa un archivo existente (las claves llevan un uuid).
        'x-upsert': 'false',
      },
    });
    if (!response.ok) {
      throw new Error(
        `Supabase Storage could not save ${key}: HTTP ${response.status}`,
      );
    }
  }

  async read(key: string): Promise<Buffer> {
    const response = await this.request('GET', key);
    if (!response.ok) {
      // Supabase responde 404, o 400 con "Object not found", según la versión.
      if (response.status === 404 || response.status === 400) {
        throw new StoredFileNotFoundError(key);
      }
      throw new Error(
        `Supabase Storage could not read ${key}: HTTP ${response.status}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    const response = await this.request('DELETE', key);
    // Borrar algo que ya no existe no es un error.
    if (!response.ok && response.status !== 404 && response.status !== 400) {
      throw new Error(
        `Supabase Storage could not remove ${key}: HTTP ${response.status}`,
      );
    }
  }

  private request(
    method: 'GET' | 'POST' | 'DELETE',
    key: string,
    init: { body?: BodyInit; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    if (!SAFE_KEY.test(key) || key.includes('..')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const path = key.split('/').map(encodeURIComponent).join('/');
    return this.fetchImpl(`${this.baseUrl}/${this.bucket}/${path}`, {
      method,
      body: init.body,
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}
