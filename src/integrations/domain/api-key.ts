import { createHash, randomBytes } from 'node:crypto';

// API key de un proyecto para servicios externos (el equipo de IA).
//
// Formato: "fc_live_" + 32 bytes aleatorios en base64url. Se guarda SOLO el
// hash SHA-256 (como una contraseña): si alguien lee la base, no obtiene
// claves utilizables. La clave completa se muestra una única vez al crearla.
export const API_KEY_PREFIX = 'fc_live_';

export function generateApiKey(): {
  key: string;
  prefix: string;
  hash: string;
} {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

// Permisos de una API key. La clave solo puede lo que sus scopes dicen, aunque
// quien la creó pueda más. Una clave de solo lectura para un BI no puede crear
// leads ni cotizaciones.
export const ApiKeyScope = {
  CATALOG_READ: 'catalog:read',
  LEADS_READ: 'leads:read',
  LEADS_WRITE: 'leads:write',
  QUOTES_WRITE: 'quotes:write',
} as const;

export type ApiKeyScope = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];

export const ALL_API_KEY_SCOPES: readonly ApiKeyScope[] =
  Object.values(ApiKeyScope);

export interface ApiKeyView {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdByUserId: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  creadoEn: Date;
}

// Lo que obtiene el guard al validar una clave.
export interface ApiKeyPrincipal {
  keyId: string;
  projectId: string;
  // La integración actúa con los permisos de quien creó la clave...
  actorUserId: string;
  // ...recortados a estos scopes.
  scopes: ApiKeyScope[];
}

export interface ApiKeysRepository {
  create(input: {
    projectId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scopes: ApiKeyScope[];
    createdByUserId: string;
  }): Promise<ApiKeyView>;
  listByProject(projectId: string): Promise<ApiKeyView[]>;
  // false si no existe en el proyecto o ya estaba revocada.
  revokeInProject(id: string, projectId: string, at: Date): Promise<boolean>;
  // Solo claves NO revocadas cuyo creador sigue existiendo.
  findActiveByHash(keyHash: string): Promise<ApiKeyPrincipal | null>;
  touchLastUsed(id: string, at: Date): Promise<void>;
}

export const API_KEYS_REPOSITORY = Symbol('API_KEYS_REPOSITORY');
