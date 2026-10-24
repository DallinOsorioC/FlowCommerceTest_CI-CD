// Lectura mínima de las entidades a las que apunta un lead (cliente y producto
// de interés), solo para saber si existen en el proyecto y si siguen activas.
//
// Es un puerto propio de Leads en vez de importar ClientsModule: ClientsModule
// ya importa LeadsModule (conversión lead → cliente) y se crearía un ciclo.
export interface ReferenceStatus {
  name: string;
  active: boolean;
}

export interface LeadReferencesReader {
  findClientInProject(
    clientId: string,
    projectId: string,
  ): Promise<ReferenceStatus | null>;
  findProductInProject(
    productId: string,
    projectId: string,
  ): Promise<ReferenceStatus | null>;
}

export const LEAD_REFERENCES_READER = Symbol('LEAD_REFERENCES_READER');
