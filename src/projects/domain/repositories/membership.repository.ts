import type { Role, UserMembership } from '@flowcommerce/types';
import type { MembershipEntity } from '../entities/membership.entity';

export interface CreateMembershipInput {
  userId: string;
  projectId: string;
  role: Role;
}

// Resultado de las escrituras que protegen al último OWNER. La comprobación y
// la escritura ocurren en la MISMA transacción (con bloqueo de filas), así que
// dos peticiones simultáneas no pueden dejar el proyecto sin OWNER.
export type RoleChangeResult =
  | { status: 'ok'; membership: MembershipEntity }
  | { status: 'not_found' }
  | { status: 'last_owner' };

export type RemoveMemberResult = 'deleted' | 'not_found' | 'last_owner';

export interface ProjectMember {
  membership: MembershipEntity;
  userId: string;
  name: string;
  email: string;
  // Solo en el listado de miembros (N6: el teléfono del asesor).
  phone?: string | null;
  position?: string | null;
  avatarUrl?: string | null;
}

// Puerto del repositorio de memberships (lo implementa Drizzle en infraestructura).
//
// Toda operación sobre una membership concreta va acotada por projectId
// (`*InProject`): el SQL siempre termina en `WHERE id = ? AND project_id = ?`.
// Un membershipId de otro proyecto se comporta igual que uno inexistente
// (null / false), sin depender de que el use-case compare el projectId.
export interface MembershipRepository {
  findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<MembershipEntity | null>;
  findMemberByIdInProject(
    id: string,
    projectId: string,
  ): Promise<ProjectMember | null>;
  findByUserAndProject(
    userId: string,
    projectId: string,
  ): Promise<MembershipEntity | null>;
  findMembersByProject(projectId: string): Promise<ProjectMember[]>;
  findMyProjects(userId: string): Promise<UserMembership[]>;
  create(input: CreateMembershipInput): Promise<MembershipEntity>;
  // Cambia el rol de forma atómica: 'last_owner' si con el cambio el proyecto
  // se quedaría sin OWNER; 'not_found' si no existe en ese proyecto.
  updateRoleInProject(
    id: string,
    projectId: string,
    role: Role,
  ): Promise<RoleChangeResult>;
  // Borra la membership de forma atómica (misma protección del último OWNER)
  // y, en la misma transacción, deja sin responsable los leads y clientes de
  // ESE proyecto que tenía asignados el usuario (sigue siendo responsable en
  // otros proyectos donde aún es miembro).
  deleteInProject(id: string, projectId: string): Promise<RemoveMemberResult>;
  countOwners(projectId: string): Promise<number>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
