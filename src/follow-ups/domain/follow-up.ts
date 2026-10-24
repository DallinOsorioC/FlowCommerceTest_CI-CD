import type { FollowUpStatus, FollowUpType } from '@flowcommerce/types';

export interface RefSummary {
  id: string;
  name: string;
}

// Seguimiento comercial de un lead tal como lo ve la API.
export interface FollowUp {
  id: string;
  projectId: string;
  leadId: string;
  lead: RefSummary;
  type: FollowUpType;
  title: string;
  notes: string | null;
  dueAt: Date;
  status: FollowUpStatus;
  // true si está PENDING y su fecha ya pasó (lo calcula el servidor).
  overdue: boolean;
  assignedUserId: string | null;
  assignedUser: RefSummary | null;
  createdByUserId: string | null;
  completedAt: Date | null;
  outcome: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

// Reglas del estado: solo un seguimiento PENDING se edita o cambia de estado.
// DONE y CANCELLED son finales (si hace falta, se crea otro).
export const FOLLOW_UP_FINAL_STATUSES: readonly FollowUpStatus[] = [
  'DONE',
  'CANCELLED',
];

export const isOverdue = (
  status: FollowUpStatus,
  dueAt: Date,
  now: Date,
): boolean => status === 'PENDING' && dueAt.getTime() < now.getTime();
