import { Permission, QuoteStatus } from '@flowcommerce/types';

// Ciclo de vida de una cotización:
//   DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> ACCEPTED -> PAID
//   PENDING_APPROVAL -> DRAFT (devolver)      SENT -> REJECTED (terminal)
//
// Se declara explícitamente en vez de permitir cualquier salto porque el dinero
// que la empresa cobre depende de este estado.
export const ALLOWED_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> =
  {
    [QuoteStatus.DRAFT]: [QuoteStatus.PENDING_APPROVAL],
    [QuoteStatus.PENDING_APPROVAL]: [QuoteStatus.APPROVED, QuoteStatus.DRAFT],
    [QuoteStatus.APPROVED]: [QuoteStatus.SENT],
    [QuoteStatus.SENT]: [QuoteStatus.ACCEPTED, QuoteStatus.REJECTED],
    [QuoteStatus.ACCEPTED]: [QuoteStatus.PAID],
    [QuoteStatus.PAID]: [],
    [QuoteStatus.REJECTED]: [],
  };

// Aprobar y cobrar son decisiones comerciales (QUOTE_APPROVE); el resto del
// ciclo lo puede mover quien tenga QUOTE_CREATE.
export function permissionForTarget(target: QuoteStatus): Permission {
  return target === QuoteStatus.APPROVED || target === QuoteStatus.PAID
    ? Permission.QUOTE_APPROVE
    : Permission.QUOTE_CREATE;
}

// Columna de fecha que se rellena al entrar en cada estado.
export const TRANSITION_TIMESTAMP_FIELD = {
  [QuoteStatus.APPROVED]: 'approvedAt',
  [QuoteStatus.SENT]: 'sentAt',
  [QuoteStatus.ACCEPTED]: 'acceptedAt',
  [QuoteStatus.REJECTED]: 'rejectedAt',
  [QuoteStatus.PAID]: 'paidAt',
} as const satisfies Partial<Record<QuoteStatus, string>>;
