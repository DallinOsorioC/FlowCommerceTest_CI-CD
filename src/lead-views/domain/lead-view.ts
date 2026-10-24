import type { LeadSource, LeadStage } from '@flowcommerce/types';
import type { LeadSortField } from '../../leads/domain/repositories/lead.repository';

// Filtros que una vista puede recordar: los mismos query params de GET /leads
// (sin paginación, que no es parte de la «vista»).
export type LeadViewFilters = {
  stage?: LeadStage;
  stages?: LeadStage[];
  search?: string;
  assignedUserId?: string;
  source?: LeadSource;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: LeadSortField;
  order?: 'asc' | 'desc';
};

export interface LeadView {
  id: string;
  projectId: string;
  name: string;
  filters: LeadViewFilters;
  createdAt: Date;
  updatedAt: Date;
}

// Tope por usuario y proyecto: son atajos, no una base de datos de filtros.
export const MAX_VIEWS_PER_USER = 20;

// Siempre acotado por (projectId, userId): las vistas son personales.
export interface LeadViewsRepository {
  list(projectId: string, userId: string): Promise<LeadView[]>;
  count(projectId: string, userId: string): Promise<number>;
  // Lanza ConflictException si ya tiene una vista con ese nombre.
  create(input: {
    projectId: string;
    userId: string;
    name: string;
    filters: LeadViewFilters;
  }): Promise<LeadView>;
  // null si no existe para ese usuario en ese proyecto.
  update(
    id: string,
    projectId: string,
    userId: string,
    patch: { name?: string; filters?: LeadViewFilters },
  ): Promise<LeadView | null>;
  delete(id: string, projectId: string, userId: string): Promise<boolean>;
}

export const LEAD_VIEWS_REPOSITORY = Symbol('LEAD_VIEWS_REPOSITORY');
