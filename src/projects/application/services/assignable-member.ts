import { BadRequestException } from '../../../common/exceptions/domain.exceptions';
import type { MembershipRepository } from '../../domain/repositories/membership.repository';

// Valida que un usuario que se va a asignar como responsable (de un lead, un
// cliente…) sea miembro del MISMO proyecto. Sin esta comprobación se podría
// asignar a un usuario de otro tenant, que es el mismo patrón de IDOR que
// citar un leadId ajeno. null / undefined = sin responsable: no se valida.
//
// Responde 400 con el mismo mensaje exista o no el usuario en otro proyecto,
// así que no revela información.
export async function assertAssignableMember(
  membershipRepository: MembershipRepository,
  userId: string | null | undefined,
  projectId: string,
): Promise<void> {
  if (!userId) {
    return;
  }

  const membership = await membershipRepository.findByUserAndProject(
    userId,
    projectId,
  );

  if (!membership) {
    throw new BadRequestException(
      'assignedUserId must be a member of this project',
    );
  }
}
