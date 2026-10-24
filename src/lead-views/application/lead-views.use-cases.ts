import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import {
  LEAD_VIEWS_REPOSITORY,
  MAX_VIEWS_PER_USER,
  type LeadView,
  type LeadViewFilters,
  type LeadViewsRepository,
} from '../domain/lead-view';

// «Guardar vista» del listado de leads. Son personales: cualquier miembro
// (incluido un VIEWER) puede guardar las suyas, porque solo recuerdan filtros
// de lectura. Nadie ve ni toca las de otra persona.

// Solo estos campos se guardan; el resto del objeto se descarta.
const FILTER_KEYS = [
  'stage',
  'stages',
  'search',
  'assignedUserId',
  'source',
  'createdFrom',
  'createdTo',
  'sortBy',
  'order',
] as const;

function cleanFilters(raw: LeadViewFilters | undefined): LeadViewFilters {
  const clean: Record<string, unknown> = {};
  for (const key of FILTER_KEYS) {
    const value = raw?.[key];
    if (value !== undefined && value !== null && value !== '') {
      clean[key] = value;
    }
  }
  return clean;
}

function cleanName(raw: string): string {
  const name = raw.trim();
  if (!name) {
    throw new BadRequestException('name must not be empty');
  }
  return name;
}

@Injectable()
export class LeadViewsUseCases {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEAD_VIEWS_REPOSITORY)
    private readonly repository: LeadViewsRepository,
  ) {}

  async list(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<LeadView[]> {
    await this.assertCan(input.actorUserId, input.projectId);
    return this.repository.list(input.projectId, input.actorUserId);
  }

  async create(input: {
    actorUserId: string;
    projectId: string;
    name: string;
    filters?: LeadViewFilters;
  }): Promise<LeadView> {
    await this.assertCan(input.actorUserId, input.projectId);
    const total = await this.repository.count(
      input.projectId,
      input.actorUserId,
    );
    if (total >= MAX_VIEWS_PER_USER) {
      throw new ConflictException(
        `You can save up to ${MAX_VIEWS_PER_USER} views. Delete one first.`,
      );
    }
    return this.repository.create({
      projectId: input.projectId,
      userId: input.actorUserId,
      name: cleanName(input.name),
      filters: cleanFilters(input.filters),
    });
  }

  async update(input: {
    actorUserId: string;
    projectId: string;
    id: string;
    name?: string;
    filters?: LeadViewFilters;
  }): Promise<LeadView> {
    await this.assertCan(input.actorUserId, input.projectId);
    const updated = await this.repository.update(
      input.id,
      input.projectId,
      input.actorUserId,
      {
        ...(input.name !== undefined && { name: cleanName(input.name) }),
        ...(input.filters !== undefined && {
          filters: cleanFilters(input.filters),
        }),
      },
    );
    if (!updated) {
      throw new NotFoundException('View not found');
    }
    return updated;
  }

  async remove(input: {
    actorUserId: string;
    projectId: string;
    id: string;
  }): Promise<void> {
    await this.assertCan(input.actorUserId, input.projectId);
    const deleted = await this.repository.delete(
      input.id,
      input.projectId,
      input.actorUserId,
    );
    if (!deleted) {
      throw new NotFoundException('View not found');
    }
  }

  private assertCan(actorUserId: string, projectId: string) {
    return this.authorizationService.assertCan(
      actorUserId,
      Permission.PROJECT_READ,
      projectId,
    );
  }
}
