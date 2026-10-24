import { Inject, Injectable, Logger } from '@nestjs/common';
import { Permission, Role } from '@flowcommerce/types';
import { IDENTITY_ADMIN } from '../../../auth/application/ports/identity-admin';
import type { IdentityAdmin } from '../../../auth/application/ports/identity-admin';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import type { MembershipRepository } from '../../../projects/domain/repositories/membership.repository';
import { USER_REPOSITORY } from '../../../users/domain/repositories/user.repository';
import type { UserRepository } from '../../../users/domain/repositories/user.repository';
import type { UserEntity } from '../../../users/domain/entities/user.entity';
import { AccessRequestEntity } from '../../domain/entities/access-request.entity';
import {
  ACCESS_REQUEST_REPOSITORY,
  type AccessRequestRepository,
} from '../../domain/repositories/access-request.repository';
import { AccessRequestStatus } from '@flowcommerce/types';

export interface ApproveAccessRequestInput {
  actorUserId: string;
  projectId: string;
  requestId: string;
}

@Injectable()
export class ApproveAccessRequestUseCase {
  private readonly logger = new Logger(ApproveAccessRequestUseCase.name);

  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(ACCESS_REQUEST_REPOSITORY)
    private readonly accessRequestRepository: AccessRequestRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
    @Inject(IDENTITY_ADMIN)
    private readonly identityAdmin: IdentityAdmin,
  ) {}

  // Flujo de aprobación: consume el PENDING de forma atómica y SOLO entonces
  // crea el usuario si no existe y lo hace MEMBER del proyecto. Su cuenta
  // se crea en Supabase Auth, que le envía el correo de invitación para
  // definir su contraseña (nunca se manda una contraseña por correo). La
  // operación queda acotada al proyecto (guard + assertCan).
  //
  // El "flip" condicional es el que grita la verdad: si otra aprobación o un
  // rechazo concurrente lo ganó, nadie debe haber recibido acceso. Por eso se
  // primero marca APPROVED y luego da de alta al usuario/membresía, y NO al
  // revés: un fallo en el flip con la membresía ya creada dejaría a alguien con
  // acceso a un proyecto donde su solicitud nunca fue aprobada.
  async execute(
    input: ApproveAccessRequestInput,
  ): Promise<AccessRequestEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_INVITE,
      input.projectId,
    );

    const request = await this.accessRequestRepository.findByIdAndProject(
      input.requestId,
      input.projectId,
    );
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new ConflictException('Access request is already handled');
    }

    const approved = await this.accessRequestRepository.approvePending(
      input.requestId,
      input.projectId,
      input.actorUserId,
    );
    if (!approved) {
      // La carrera se perdió: otro admin aprobó o rechazó antes. Nadie ha
      // recibido acceso porque la membresía aún no existe.
      throw new ConflictException('Access request is already handled');
    }

    // Si no se puede crear la cuenta (Supabase caído), la solicitud vuelve a
    // PENDING para poder reintentar; si no, quedaría «aprobada» sin que nadie
    // pudiera completar el alta.
    let user: UserEntity;
    try {
      user = await this.findOrCreateUser(request.email);
    } catch (error) {
      await this.accessRequestRepository
        .revertApproved(input.requestId, input.projectId, input.actorUserId)
        .catch((revertError: unknown) =>
          this.logger.error(
            `Could not reopen access request ${input.requestId}: ${
              revertError instanceof Error
                ? revertError.message
                : String(revertError)
            }`,
          ),
        );
      throw error;
    }

    const member = await this.membershipRepository.findByUserAndProject(
      user.id,
      input.projectId,
    );
    if (!member) {
      try {
        await this.membershipRepository.create({
          userId: user.id,
          projectId: input.projectId,
          role: Role.MEMBER,
        });
      } catch (error) {
        // Carrera: dos aprobaciones concurrentes de distinta solicitud para el
        // mismo email/proyecto. La restricción unique (user_id, project_id) la
        // gana una; la otra relee la membresía que ya existe y sigue.
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    return approved;
  }

  // Resuelve el usuario de la solicitud creándolo si no existe. Si dos
  // aprobaciones concurrentes crean al mismo usuario, una pierde el unique de
  // users.email y debe releer la fila ganadora en vez de explotar en un 500.
  private async findOrCreateUser(email: string): Promise<UserEntity> {
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      return existing;
    }

    const name = email.split('@')[0]?.trim() || 'New Member';
    // Crea la cuenta en Supabase y le envía la invitación. Su id pasa a ser
    // users.id; si la cuenta ya existía allí, se reutiliza su id.
    const identity = await this.identityAdmin.inviteByEmail({ email, name });

    try {
      return await this.userRepository.create({
        id: identity.id,
        name,
        email,
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const winner = await this.userRepository.findByEmail(email);
      if (!winner) {
        throw error;
      }
      return winner;
    }
  }

  // Identifica el SQLSTATE 23505 (unique_violation). Drizzle envuelve el error
  // del driver en un DrizzleQueryError y deja el código real en error.cause,
  // por lo que hay que recorrer la cadena de causes para encontrarlo.
  private isUniqueViolation(error: unknown): boolean {
    let current = error;
    for (let depth = 0; depth < 10; depth++) {
      if (typeof current !== 'object' || current === null) {
        return false;
      }

      if ((current as { code?: unknown }).code === '23505') {
        return true;
      }

      if (!('cause' in current)) {
        return false;
      }

      current = (current as { cause?: unknown }).cause;
    }

    return false;
  }
}
