import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { memberships, projects, type ProjectRow } from '../../../db/schema';
import { MembershipEntity } from '../../domain/entities/membership.entity';
import { ProjectEntity } from '../../domain/entities/project.entity';
import type {
  CreateProjectInput,
  CreateProjectWithOwnerInput,
  CreateProjectWithOwnerResult,
  ProjectRepository,
  UpdateProjectInput,
} from '../../domain/repositories/project.repository';

@Injectable()
export class DrizzleProjectRepository implements ProjectRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async findById(id: string): Promise<ProjectEntity | null> {
    const row = await this.db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async findBySlug(slug: string): Promise<ProjectEntity | null> {
    const row = await this.db.query.projects.findFirst({
      where: eq(projects.slug, slug),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async create(input: CreateProjectInput): Promise<ProjectEntity> {
    const [row] = await this.db
      .insert(projects)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async update(
    id: string,
    input: UpdateProjectInput,
  ): Promise<ProjectEntity | null> {
    const changes: Partial<typeof projects.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined)
      changes.description = input.description;

    const { billing, quoteSettings } = input;
    if (billing?.legalName !== undefined)
      changes.billingLegalName = billing.legalName;
    if (billing?.taxId !== undefined) changes.billingTaxId = billing.taxId;
    if (billing?.address !== undefined)
      changes.billingAddress = billing.address;
    if (billing?.phone !== undefined) changes.billingPhone = billing.phone;
    if (billing?.email !== undefined) changes.billingEmail = billing.email;

    if (quoteSettings?.taxPercent !== undefined)
      changes.quoteTaxPercent = quoteSettings.taxPercent;
    if (quoteSettings?.folioPrefix !== undefined)
      changes.quoteFolioPrefix = quoteSettings.folioPrefix;
    if (quoteSettings?.validityDays !== undefined)
      changes.quoteValidityDays = quoteSettings.validityDays;
    if (quoteSettings?.defaultTerms !== undefined)
      changes.quoteDefaultTerms = quoteSettings.defaultTerms;
    if (quoteSettings?.currency !== undefined)
      changes.currency = quoteSettings.currency;

    const [row] = await this.db
      .update(projects)
      .set(changes)
      .where(eq(projects.id, id))
      .returning();

    return row ? this.mapToEntity(row) : null;
  }

  // Crea el proyecto y su membresía OWNER dentro de una misma transacción,
  // garantizando que el proyecto nunca quede sin propietario.
  async createWithOwner(
    input: CreateProjectWithOwnerInput,
  ): Promise<CreateProjectWithOwnerResult> {
    return this.db.transaction(async (tx) => {
      const [projectRow] = await tx
        .insert(projects)
        .values({
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
        })
        .returning();

      const [ownerRow] = await tx
        .insert(memberships)
        .values({
          userId: input.ownerUserId,
          projectId: projectRow.id,
          role: 'OWNER',
        })
        .returning();

      return {
        project: this.mapToEntity(projectRow),
        ownerMembership: new MembershipEntity(
          ownerRow.id,
          ownerRow.userId,
          ownerRow.projectId,
          ownerRow.role as 'OWNER',
          ownerRow.createdAt,
          ownerRow.updatedAt,
        ),
      };
    });
  }

  private mapToEntity(row: ProjectRow): ProjectEntity {
    return new ProjectEntity(
      row.id,
      row.name,
      row.slug,
      row.description,
      row.createdAt,
      row.updatedAt,
      {
        legalName: row.billingLegalName,
        taxId: row.billingTaxId,
        address: row.billingAddress,
        phone: row.billingPhone,
        email: row.billingEmail,
      },
      {
        taxPercent: row.quoteTaxPercent,
        folioPrefix: row.quoteFolioPrefix,
        validityDays: row.quoteValidityDays,
        defaultTerms: row.quoteDefaultTerms,
        currency: row.currency,
      },
    );
  }
}
