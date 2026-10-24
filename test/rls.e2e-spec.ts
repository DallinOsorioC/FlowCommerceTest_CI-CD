import { sql } from 'drizzle-orm';
import { createE2eApp, type E2eContext } from './support/e2e-app';

// En Supabase, toda tabla de public queda expuesta a la clave anónima si no
// tiene RLS. Esta prueba falla si una migración nueva crea una tabla sin
// activarlo.
describe('Row Level Security (e2e)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('has RLS enabled on every table in the public schema', async () => {
    const rows = await ctx.db.execute<{ relname: string }>(sql`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND NOT c.relrowsecurity
      ORDER BY c.relname
    `);

    expect(rows.map((row) => row.relname)).toEqual([]);
  });
});
