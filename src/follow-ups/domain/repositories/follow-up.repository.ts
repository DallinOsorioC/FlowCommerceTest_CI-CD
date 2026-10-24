import type { FollowUpStatus, FollowUpType } from '@flowcommerce/types';
import type { FollowUp } from '../follow-up';

export interface CreateFollowUpInput {
  projectId: string;
  leadId: string;
  type: FollowUpType;
  title: string;
  notes: string | null;
  dueAt: Date;
  assignedUserId: string | null;
  createdByUserId: string;
}

export interface UpdateFollowUpInput {
  type?: FollowUpType;
  title?: string;
  notes?: string | null;
  dueAt?: Date;
  assignedUserId?: string | null;
  status?: FollowUpStatus;
  completedAt?: Date | null;
  outcome?: string | null;
}

export interface ListFollowUpsFilter {
  leadId?: string;
  status?: FollowUpStatus;
  assignedUserId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  // true = solo PENDING con fecha ya pasada.
  overdue?: boolean;
  page?: number;
  limit?: number;
}

// Siempre con projectId: un seguimiento de otro tenant no existe para nadie.
export interface FollowUpRepository {
  create(input: CreateFollowUpInput): Promise<FollowUp>;
  findByIdInProject(id: string, projectId: string): Promise<FollowUp | null>;
  listByProject(
    projectId: string,
    filter: ListFollowUpsFilter,
  ): Promise<{ followUps: FollowUp[]; total: number }>;
  // Solo actúa si sigue PENDING (el WHERE lo comprueba): dos usuarios no
  // pueden completar y cancelar a la vez. null = no existe o ya no está
  // pendiente.
  updatePendingInProject(
    id: string,
    projectId: string,
    input: UpdateFollowUpInput,
  ): Promise<FollowUp | null>;
  deleteInProject(id: string, projectId: string): Promise<boolean>;
}

export const FOLLOW_UPS_REPOSITORY = Symbol('FOLLOW_UPS_REPOSITORY');
