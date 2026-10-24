import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { AccessRequestStatus as Status } from '@flowcommerce/types';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { accessRequests, type AccessRequestRow } from '../../../db/schema';
import { AccessRequestEntity } from '../../domain/entities/access-request.entity';
import type {
  AccessRequestRepository,
  CreateAccessRequestInput,
} from '../../domain/repositories/access-request.repository';

@Injectable()
export class DrizzleAccessRequestRepository implements AccessRequestRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async findByIdAndProject(
    id: string,
    projectId: string,
  ): Promise<AccessRequestEntity | null> {
    const row = await this.db.query.accessRequests.findFirst({
      where: and(
        eq(accessRequests.id, id),
        eq(accessRequests.projectId, projectId),
      ),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async findPendingByProjectAndEmail(
    projectId: string,
    email: string,
  ): Promise<AccessRequestEntity | null> {
    const row = await this.db.query.accessRequests.findFirst({
      where: and(
        eq(accessRequests.projectId, projectId),
        eq(accessRequests.email, email),
        eq(accessRequests.status, Status.PENDING),
      ),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async listByProject(projectId: string): Promise<AccessRequestEntity[]> {
    const rows = await this.db.query.accessRequests.findMany({
      where: eq(accessRequests.projectId, projectId),
      orderBy: desc(accessRequests.createdAt),
    });

    return rows.map((row) => this.mapToEntity(row));
  }

  async create(input: CreateAccessRequestInput): Promise<AccessRequestEntity> {
    const [row] = await this.db
      .insert(accessRequests)
      .values({
        projectId: input.projectId,
        email: input.email,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async approvePending(
    id: string,
    projectId: string,
    handledByUserId: string,
  ): Promise<AccessRequestEntity | null> {
    const [row] = await this.db
      .update(accessRequests)
      .set({
        status: Status.APPROVED,
        atendidoEn: new Date(),
        atendidoPorUserId: handledByUserId,
      })
      .where(
        and(
          eq(accessRequests.id, id),
          eq(accessRequests.projectId, projectId),
          eq(accessRequests.status, Status.PENDING),
        ),
      )
      .returning();

    return row ? this.mapToEntity(row) : null;
  }

  async revertApproved(
    id: string,
    projectId: string,
    handledByUserId: string,
  ): Promise<void> {
    await this.db
      .update(accessRequests)
      .set({
        status: Status.PENDING,
        atendidoEn: null,
        atendidoPorUserId: null,
      })
      .where(
        and(
          eq(accessRequests.id, id),
          eq(accessRequests.projectId, projectId),
          eq(accessRequests.status, Status.APPROVED),
          eq(accessRequests.atendidoPorUserId, handledByUserId),
        ),
      );
  }

  async rejectPending(
    id: string,
    projectId: string,
    handledByUserId: string,
  ): Promise<AccessRequestEntity | null> {
    const [row] = await this.db
      .update(accessRequests)
      .set({
        status: Status.REJECTED,
        atendidoEn: new Date(),
        atendidoPorUserId: handledByUserId,
      })
      .where(
        and(
          eq(accessRequests.id, id),
          eq(accessRequests.projectId, projectId),
          eq(accessRequests.status, Status.PENDING),
        ),
      )
      .returning();

    return row ? this.mapToEntity(row) : null;
  }

  private mapToEntity(row: AccessRequestRow): AccessRequestEntity {
    return new AccessRequestEntity(
      row.id,
      row.projectId,
      row.email,
      row.status,
      row.atendidoEn,
      row.atendidoPorUserId,
      row.createdAt,
      row.updatedAt,
    );
  }
}
