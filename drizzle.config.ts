import { defineConfig } from 'drizzle-kit';

// Las migraciones van por la conexión DIRECTA (Supabase: puerto 5432). El
// pooler en modo transacción no sirve para DDL ni prepared statements.
//
// Se usa || y no ??: un secreto de GitHub Actions que no existe llega como
// cadena vacía, y con ?? esa cadena vacía ganaría sobre DATABASE_URL.
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Falta configurar DIRECT_URL o DATABASE_URL');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
