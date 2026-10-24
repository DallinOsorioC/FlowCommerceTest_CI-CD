import type {
  ProjectBillingProfile,
  ProjectQuoteSettings,
} from '@flowcommerce/types';
import type { ProjectEntity } from '../entities/project.entity';
import type { MembershipEntity } from '../entities/membership.entity';

export interface CreateProjectInput {
  name: string;
  slug: string;
  description?: string | null;
}

// Cambios parciales: lo que no viene no se toca; null borra un dato opcional.
export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  billing?: Partial<ProjectBillingProfile>;
  quoteSettings?: Partial<ProjectQuoteSettings>;
}

export interface CreateProjectWithOwnerInput extends CreateProjectInput {
  ownerUserId: string;
}

export interface CreateProjectWithOwnerResult {
  project: ProjectEntity;
  ownerMembership: MembershipEntity;
}

// Puerto del repositorio de proyectos (lo implementa Drizzle en infraestructura).
export interface ProjectRepository {
  findById(id: string): Promise<ProjectEntity | null>;
  findBySlug(slug: string): Promise<ProjectEntity | null>;
  create(input: CreateProjectInput): Promise<ProjectEntity>;
  // null si el proyecto no existe.
  update(id: string, input: UpdateProjectInput): Promise<ProjectEntity | null>;
  createWithOwner(
    input: CreateProjectWithOwnerInput,
  ): Promise<CreateProjectWithOwnerResult>;
}

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
