import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  StoredFileNotFoundError,
  type FileStorage,
} from '../../domain/file-storage';

// Claves válidas: letras, números, guiones, puntos y barras. Nada de "..".
const SAFE_KEY = /^[a-z0-9][a-z0-9/._-]*$/i;

// Almacenamiento en una carpeta del servidor (UPLOADS_DIR, por defecto
// ./uploads). Suficiente para la demo y para un solo servidor; si el backend
// se despliega en varias instancias o en un contenedor sin disco persistente,
// hay que cambiar esta clase por una de S3/R2 (el puerto no cambia).
@Injectable()
export class LocalDiskFileStorage implements FileStorage {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = resolve(configService.get<string>('UPLOADS_DIR') ?? 'uploads');
  }

  async save(key: string, content: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // 'wx': nunca pisa un archivo existente (las claves llevan un uuid).
    await writeFile(path, content, { flag: 'wx' });
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StoredFileNotFoundError(key);
      }
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  // Defensa en profundidad: aunque las claves las genera el servidor, se
  // comprueba que la ruta final quede DENTRO de la carpeta de uploads.
  private pathFor(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes('..')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Storage key escapes the uploads folder: ${key}`);
    }
    return path;
  }
}
