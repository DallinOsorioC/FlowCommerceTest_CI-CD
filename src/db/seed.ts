import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { SupabaseIdentityAdmin } from '../auth/infrastructure/supabase/supabase-identity.admin';
import { createDatabaseConnection } from './index';
import { users } from './schema';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed cannot be executed in production');
}

const SEED_USER_EMAIL = 'seed@flowcommerce.local';
const SEED_USER_NAME = 'Seed User';
const SEED_USER_PASSWORD = 'SeedPassword123!';

// Crea el usuario semilla (nunca en producción). Con SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY crea también su cuenta en Supabase Auth (ya
// confirmada), con el MISMO id que users.id, para poder iniciar sesión desde el
// frontend. Sin ellas solo crea el perfil local, con el que no se puede entrar.
async function seed(): Promise<void> {
  const { db, client } = createDatabaseConnection(databaseUrl as string);

  try {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, SEED_USER_EMAIL),
    });
    if (existing) {
      console.log(`Seed user already exists: ${SEED_USER_EMAIL}`);
      return;
    }

    const config = new ConfigService(process.env);
    let id: string | undefined;
    if (config.get('SUPABASE_URL') && config.get('SUPABASE_SERVICE_ROLE_KEY')) {
      ({ id } = await new SupabaseIdentityAdmin(config).createConfirmedUser({
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        name: SEED_USER_NAME,
      }));
    } else {
      console.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: only the local profile is created (you will not be able to log in).',
      );
    }

    const [row] = await db
      .insert(users)
      .values({
        ...(id ? { id } : {}),
        name: SEED_USER_NAME,
        email: SEED_USER_EMAIL,
        emailVerified: true,
      })
      .returning();
    console.log(`Seed user created: ${row.email}`);
  } finally {
    await client.end();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
