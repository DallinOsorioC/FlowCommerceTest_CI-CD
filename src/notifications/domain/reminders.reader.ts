// Lecturas del job de recordatorios (solo lectura, en todos los proyectos:
// el job no actúa en nombre de un usuario, recorre los datos vencidos).
export interface DueFollowUp {
  id: string;
  projectId: string;
  leadId: string;
  leadName: string;
  title: string;
  dueAt: Date;
  assignedUserId: string | null;
  createdByUserId: string | null;
}

export interface ExpiredQuote {
  id: string;
  projectId: string;
  folio: string;
  validUntil: Date;
  createdByUserId: string | null;
}

export interface StaleLead {
  id: string;
  projectId: string;
  name: string;
  assignedUserId: string | null;
  // Último contacto (o la creación, si nunca se le escribió).
  lastActivityAt: Date;
}

export interface RemindersReader {
  // Leads abiertos (ni ganados ni perdidos) sin contacto desde `staleBefore`.
  findStaleLeads(staleBefore: Date, limit: number): Promise<StaleLead[]>;
  // Seguimientos PENDING cuya fecha ya llegó.
  findDueFollowUps(now: Date, limit: number): Promise<DueFollowUp[]>;
  // Cotizaciones SENT cuya vigencia ya pasó (el cliente no respondió a tiempo).
  findExpiredSentQuotes(now: Date, limit: number): Promise<ExpiredQuote[]>;
}

export const REMINDERS_READER = Symbol('REMINDERS_READER');
