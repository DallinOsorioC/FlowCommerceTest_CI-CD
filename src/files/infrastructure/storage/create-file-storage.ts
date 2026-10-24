import { ConfigService } from '@nestjs/config';
import type { FileStorage } from '../../domain/file-storage';
import { LocalDiskFileStorage } from './local-disk-file-storage';
import { SupabaseFileStorage } from './supabase-file-storage';

// Dónde se guardan los archivos. La elección es EXPLÍCITA en el .env:
//
//   FILE_STORAGE_DRIVER=local      (carpeta del servidor; valor por defecto)
//   FILE_STORAGE_DRIVER=supabase   (Supabase Storage, bucket privado)
//
// Opciones para producción (ver README → "Almacenamiento de archivos"):
//   - "s3": AWS S3, Cloudflare R2 o MinIO. Hay que escribir S3FileStorage
//     con @aws-sdk/client-s3 y coordinar las llaves con CI/CD.
//   - "cloudinary": plan gratis, bueno para imágenes; necesita cuenta.
//
// Un valor desconocido detiene el arranque con un mensaje claro, en lugar de
// guardar archivos en un lugar que nadie eligió.
export const FILE_STORAGE_DRIVERS = ['local', 'supabase'] as const;
export type FileStorageDriver = (typeof FILE_STORAGE_DRIVERS)[number];

export function resolveFileStorageDriver(
  value: string | undefined,
): FileStorageDriver {
  const driver = (value ?? 'local').trim().toLowerCase();
  if (!(FILE_STORAGE_DRIVERS as readonly string[]).includes(driver)) {
    throw new Error(
      `FILE_STORAGE_DRIVER="${value}" is not supported. Available: ${FILE_STORAGE_DRIVERS.join(', ')}`,
    );
  }
  return driver as FileStorageDriver;
}

export function createFileStorage(configService: ConfigService): FileStorage {
  switch (
    resolveFileStorageDriver(configService.get<string>('FILE_STORAGE_DRIVER'))
  ) {
    case 'local':
      return new LocalDiskFileStorage(configService);
    case 'supabase':
      return new SupabaseFileStorage(configService);
  }
}
