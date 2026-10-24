import type { Options } from 'postgres';

// Opciones del cliente postgres según dónde esté la base.
//
// Supabase ofrece dos conexiones:
//   - Directa (puerto 5432): sin pooler. Para migraciones y para un servidor
//     de larga vida.
//   - Pooler (Supavisor): en modo «transacción» (puerto 6543) NO admite
//     prepared statements, así que el driver debe crearlas sin nombre
//     (prepare: false); si no, las consultas fallan de forma intermitente.
// Se detecta por el puerto 6543 o por ?pgbouncer=true en la URL, y se puede
// forzar con DATABASE_PREPARE=false.
//
// SSL: Supabase lo exige. postgres.js lo activa con ?sslmode=require en la
// URL; aquí no se toca para no romper la base local de desarrollo (docker).

export function usesTransactionPooler(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    return url.port === '6543' || url.searchParams.get('pgbouncer') === 'true';
  } catch {
    return false;
  }
}

export function connectionOptions(
  databaseUrl: string,
  env: Record<string, string | undefined> = process.env,
): Options<Record<string, never>> {
  const max = Number(env.DATABASE_POOL_MAX);
  return {
    // Con un pooler externo el pool propio debe ser chico: cada conexión
    // cuenta contra el límite del plan de Supabase.
    max: Number.isInteger(max) && max > 0 ? max : 10,
    prepare:
      env.DATABASE_PREPARE === 'false'
        ? false
        : !usesTransactionPooler(databaseUrl),
  };
}
