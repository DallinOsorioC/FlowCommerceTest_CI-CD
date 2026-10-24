// Puerto del almacenamiento de archivos. Hoy lo implementa el disco local
// (LocalDiskFileStorage); mañana podría ser S3/R2 sin tocar los casos de uso.
// Las claves las genera SIEMPRE el servidor (nunca el nombre que manda el
// cliente): "projects/<projectId>/attachments/<uuid>.pdf".
export interface FileStorage {
  save(key: string, content: Buffer): Promise<void>;
  // Lanza StoredFileNotFoundError si no existe.
  read(key: string): Promise<Buffer>;
  // No falla si ya no existe.
  remove(key: string): Promise<void>;
}

export class StoredFileNotFoundError extends Error {
  constructor(key: string) {
    super(`Stored file not found: ${key}`);
    this.name = 'StoredFileNotFoundError';
  }
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
