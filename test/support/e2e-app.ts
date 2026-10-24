import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { SESSION_MANAGER } from '../../src/auth/application/ports/session-manager';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import type { Database } from '../../src/db';
import { DATABASE_CLIENT } from '../../src/db/database.constants';
import { memberships, projects, users } from '../../src/db/schema';

// Arranque común de las suites e2e nuevas: la app con la misma configuración
// que main.ts (prefijo, versión, validación, filtro de errores) y una sesión
// simulada que reconoce la cookie `user.<uuid>`. La sesión real
// (JWT de Supabase) se prueba en supabase-auth.e2e-spec.ts.

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface E2eContext {
  app: INestApplication<App>;
  db: Database;
  cookie: (userId: string) => string;
  // Crea usuarios, proyectos y membresías; devuelve una función de limpieza.
  seedTenants: (spec: TenantSpec[]) => Promise<SeededTenants>;
  close: () => Promise<void>;
}

export interface TenantSpec {
  key: string;
  members: Partial<Record<Role, number>>;
}

export interface SeededTenants {
  project: (key: string) => string;
  // Usuario de un rol en un proyecto (índice 0 por defecto).
  user: (key: string, role: Role, index?: number) => string;
  // Membresía de ese usuario en su proyecto.
  membership: (key: string, role: Role, index?: number) => string;
  cleanup: () => Promise<void>;
}

export async function createE2eApp(
  configure?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<E2eContext> {
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 60 * 1000);
  const sessionManager = {
    getSession: jest.fn((headers: Headers) => {
      const value = headers.get('cookie') ?? '';
      const userId = /user\.([0-9a-f-]{36})/i.exec(value)?.[1];
      if (!userId) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        user: {
          id: userId,
          name: 'E2E User',
          email: `e2e-${userId}@flowcommerce.test`,
          creadoEn: now,
          actualizadoEn: now,
        },
        session: { id: `session-${userId}`, userId, expiresAt: future },
      });
    }),
  };

  const builder = Test.createTestingModule({ imports: [AppModule] });
  builder.overrideProvider(SESSION_MANAGER).useValue(sessionManager);
  configure?.(builder);
  const moduleFixture: TestingModule = await builder.compile();

  // rawBody como en main.ts: los webhooks (WhatsApp, Pagos) verifican la firma
  // sobre el cuerpo crudo.
  const app = moduleFixture.createNestApplication<INestApplication<App>>({
    rawBody: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();

  const db = app.get<Database>(DATABASE_CLIENT);

  const seedTenants = async (spec: TenantSpec[]): Promise<SeededTenants> => {
    const projectIds = new Map<string, string>();
    const userIds = new Map<string, string>();
    const membershipIds = new Map<string, string>();
    const slot = (key: string, role: Role, index = 0) =>
      `${key}:${role}:${index}`;

    for (const tenant of spec) {
      projectIds.set(tenant.key, randomUUID());
      for (const [role, total] of Object.entries(tenant.members)) {
        for (let index = 0; index < (total ?? 0); index++) {
          userIds.set(slot(tenant.key, role as Role, index), randomUUID());
          membershipIds.set(
            slot(tenant.key, role as Role, index),
            randomUUID(),
          );
        }
      }
    }

    const allUsers = [...userIds.values()];
    const allProjects = [...projectIds.values()];

    await db.insert(users).values(
      allUsers.map((id) => ({
        id,
        name: 'E2E Seed',
        email: `e2e-${id}@flowcommerce.test`,
      })),
    );
    await db.insert(projects).values(
      spec.map((tenant) => ({
        id: projectIds.get(tenant.key)!,
        name: `E2E ${tenant.key}`,
        slug: `e2e-${projectIds.get(tenant.key)}`,
      })),
    );
    await db.insert(memberships).values(
      [...userIds.entries()].map(([key, userId]) => {
        const [tenantKey, role] = key.split(':');
        return {
          id: membershipIds.get(key)!,
          userId,
          projectId: projectIds.get(tenantKey)!,
          role: role as Role,
        };
      }),
    );

    const pick = (map: Map<string, string>, key: string) => {
      const value = map.get(key);
      if (!value) {
        throw new Error(`Unknown seed slot ${key}`);
      }
      return value;
    };

    return {
      project: (key) => pick(projectIds, key),
      user: (key, role, index) => pick(userIds, slot(key, role, index)),
      membership: (key, role, index) =>
        pick(membershipIds, slot(key, role, index)),
      // Borrar el proyecto arrastra en cascada todo lo del tenant (leads,
      // quotes, products, clients…); luego se borran los usuarios.
      cleanup: async () => {
        await db.delete(projects).where(inArray(projects.id, allProjects));
        await db.delete(users).where(inArray(users.id, allUsers));
      },
    };
  };

  return {
    app,
    db,
    cookie: (userId) => `flowcommerce.session_token=user.${userId}`,
    seedTenants,
    close: () => app.close(),
  };
}
