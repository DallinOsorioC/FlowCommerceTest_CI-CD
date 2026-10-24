import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { apiKeys, type ApiKeyRow } from '../../../db/schema';
import type {
  ApiKeyScope,
  ApiKeyPrincipal,
  ApiKeysRepository,
  ApiKeyView,
} from '../../domain/api-key';

@Injectable()
export class DrizzleApiKeysRepository implements ApiKeysRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async create(input: {
    projectId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scopes: ApiKeyScope[];
    createdByUserId: string;
  }): Promise<ApiKeyView> {
    const [row] = await this.db.insert(apiKeys).values(input).returning();
    return this.map(row);
  }

  async listByProject(projectId: string): Promise<ApiKeyView[]> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.projectId, projectId))
      .orderBy(asc(apiKeys.createdAt));
    return rows.map((row) => this.map(row));
  }

  async revokeInProject(
    id: string,
    projectId: string,
    at: Date,
  ): Promise<boolean> {
    const updated = await this.db
      .update(apiKeys)
      .set({ revokedAt: at })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.projectId, projectId),
          isNull(apiKeys.revokedAt),
        ),
      )
      .returning({ id: apiKeys.id });
    return updated.length > 0;
  }

  async findActiveByHash(keyHash: string): Promise<ApiKeyPrincipal | null> {
    const [row] = await this.db
      .select({
        id: apiKeys.id,
        projectId: apiKeys.projectId,
        createdByUserId: apiKeys.createdByUserId,
        scopes: apiKeys.scopes,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          isNull(apiKeys.revokedAt),
          isNotNull(apiKeys.createdByUserId),
        ),
      )
      .limit(1);
    return row && row.createdByUserId
      ? {
          keyId: row.id,
          projectId: row.projectId,
          actorUserId: row.createdByUserId,
          scopes: row.scopes as ApiKeyScope[],
        }
      : null;
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({ lastUsedAt: at })
      .where(eq(apiKeys.id, id));
  }

  private map(row: ApiKeyRow): ApiKeyView {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes as ApiKeyScope[],
      createdByUserId: row.createdByUserId,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
      creadoEn: row.createdAt,
    };
  }
}
