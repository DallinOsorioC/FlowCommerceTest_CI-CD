import { Inject, Injectable } from '@nestjs/common';
import type { Project } from '@flowcommerce/types';
import { ConflictException } from '../../../common/exceptions/domain.exceptions';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../domain/repositories/project.repository';

export interface CreateProjectInput {
  ownerUserId: string;
  name: string;
  slug: string;
  description?: string | null;
}

@Injectable()
export class CreateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  // Crea un proyecto nuevo, verificando antes que el slug esté libre.
  async execute(input: CreateProjectInput): Promise<Project> {
    const slug = normalizeSlug(input.slug);
    const existing = await this.projectRepository.findBySlug(slug);

    if (existing) {
      throw new ConflictException('A project with this slug already exists');
    }

    const { project } = await this.projectRepository.createWithOwner({
      name: input.name,
      slug,
      description: input.description ?? null,
      ownerUserId: input.ownerUserId,
    });

    return project.toProject();
  }
}

// Normaliza el slug: minúsculas, sin espacios al inicio/final y espacios -> guiones.
export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}
