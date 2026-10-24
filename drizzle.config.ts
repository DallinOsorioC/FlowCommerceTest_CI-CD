import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Las migraciones van por la conexión DIRECTA (Supabase: puerto 5432). El
    // pooler en modo transacción no sirve para DDL ni prepared statements.
    url: (process.env.DIRECT_URL ?? process.env.DATABASE_URL)!,
  },
});
