import type { LeadStage, QuoteStatus } from '@flowcommerce/types';

// Resultado de la búsqueda global (barra superior, ⌘K): pocos campos por
// tipo, los justos para mostrar la fila y navegar al detalle.
export interface SearchResults {
  leads: {
    id: string;
    name: string;
    company: string | null;
    stage: LeadStage;
  }[];
  clients: {
    id: string;
    name: string;
    company: string | null;
    taxId: string | null;
  }[];
  quotes: {
    id: string;
    folio: string;
    status: QuoteStatus;
    total: number;
    customerName: string;
  }[];
}

export type SearchScope = keyof SearchResults;

export interface SearchRepository {
  // Cada tipo solo se consulta si viene en `scopes` (según permisos).
  search(
    projectId: string,
    term: string,
    scopes: readonly SearchScope[],
    limit: number,
  ): Promise<SearchResults>;
}

export const SEARCH_REPOSITORY = Symbol('SEARCH_REPOSITORY');
