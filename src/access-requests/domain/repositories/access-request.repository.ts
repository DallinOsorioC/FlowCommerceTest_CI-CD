import type { AccessRequestEntity } from '../entities/access-request.entity';

export interface CreateAccessRequestInput {
  projectId: string;
  email: string;
}

// Puerto del repositorio de solicitudes de acceso (lo implementa Drizzle en
// infraestructura). Todas las consultas por id se acotan al projectId para no
// romper el aislamiento multi-tenant.
export interface AccessRequestRepository {
  findByIdAndProject(
    id: string,
    projectId: string,
  ): Promise<AccessRequestEntity | null>;
  findPendingByProjectAndEmail(
    projectId: string,
    email: string,
  ): Promise<AccessRequestEntity | null>;
  listByProject(projectId: string): Promise<AccessRequestEntity[]>;
  create(input: CreateAccessRequestInput): Promise<AccessRequestEntity>;
  // Transiciones condicionales: sólo mueve un PENDING. Devuelve null si la
  // solicitud ya fue resuelta (por ejemplo, por una aprobación concurrente).
  approvePending(
    id: string,
    projectId: string,
    handledByUserId: string,
  ): Promise<AccessRequestEntity | null>;
  // Deshace una aprobación que no se pudo completar (p. ej. Supabase caído al
  // crear la cuenta): solo mueve un APPROVED hecho por ese mismo usuario.
  revertApproved(
    id: string,
    projectId: string,
    handledByUserId: string,
  ): Promise<void>;
  rejectPending(
    id: string,
    projectId: string,
    handledByUserId: string,
  ): Promise<AccessRequestEntity | null>;
}

export const ACCESS_REQUEST_REPOSITORY = Symbol('ACCESS_REQUEST_REPOSITORY');
