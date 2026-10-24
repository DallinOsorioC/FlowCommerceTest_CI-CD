import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@flowcommerce/types';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '../../auth/application/ports/email-sender';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import { canAssignRole } from '../../authorization/domain/role.rules';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import { normalizeEmail } from '../../common/utils/user.mapper';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../projects/domain/repositories/membership.repository';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../projects/domain/repositories/project.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/repositories/user.repository';
import {
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  isExpiredInvitation,
  newInvitationToken,
  type Invitation,
  type InvitationRole,
} from '../domain/invitation';
import {
  INVITATIONS_REPOSITORY,
  type InvitationsRepository,
} from '../domain/invitations.repository';

const DAY_MS = 86_400_000;

// Invitar por correo (N1/Marlon): el OWNER/ADMIN escribe un correo y un rol;
// la persona recibe un enlace, inicia sesión (o se registra con ese correo) y
// acepta. Así nadie necesita conocer el UUID del proyecto.
@Injectable()
export class InviteMemberUseCase {
  private readonly logger = new Logger(InviteMemberUseCase.name);

  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(INVITATIONS_REPOSITORY)
    private readonly repository: InvitationsRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(EMAIL_SENDER)
    private readonly emailSender: EmailSender,
    private readonly config: ConfigService,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    email: string;
    role: InvitationRole;
  }): Promise<Invitation> {
    const decision = await this.authorizationService.decide(
      input.actorUserId,
      [Permission.MEMBER_INVITE],
      input.projectId,
    );
    if (!decision.allowed || !decision.role) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }
    // Misma jerarquía que al cambiar roles: un ADMIN no invita ADMINs.
    if (!canAssignRole(decision.role, input.role)) {
      throw new ForbiddenException(
        'Your role cannot invite members with that role',
      );
    }

    const email = normalizeEmail(input.email);
    const existing = await this.userRepository.findByEmail(email);
    if (
      existing &&
      (await this.membershipRepository.findByUserAndProject(
        existing.id,
        input.projectId,
      ))
    ) {
      throw new ConflictException('That user is already a member');
    }

    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const inviter = await this.userRepository.findById(input.actorUserId);

    const { token, tokenHash } = newInvitationToken();
    const invitation = await this.repository.replacePending({
      projectId: input.projectId,
      email,
      role: input.role,
      tokenHash,
      invitedByUserId: input.actorUserId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS),
    });

    const link = `${this.appUrl()}/invitations/accept?token=${encodeURIComponent(token)}`;
    const who = inviter?.name ?? 'Un administrador';
    try {
      await this.emailSender.send({
        to: email,
        subject: `${who} te invitó a ${project.name} en FlowCommerce`,
        text: [
          `${who} te invitó a unirte a "${project.name}" como ${input.role}.`,
          '',
          `Acepta la invitación aquí (vence en ${INVITATION_TTL_DAYS} días):`,
          link,
          '',
          `Si no tienes cuenta, regístrate con este mismo correo (${email}) y vuelve a abrir el enlace.`,
        ].join('\n'),
        html: `<p>${escapeHtml(who)} te invitó a unirte a <b>${escapeHtml(project.name)}</b> como ${input.role}.</p><p><a href="${escapeHtml(link)}">Aceptar invitación</a> (vence en ${INVITATION_TTL_DAYS} días)</p><p>Si no tienes cuenta, regístrate con este mismo correo (${escapeHtml(email)}) y vuelve a abrir el enlace.</p>`,
      });
    } catch (error) {
      // Sin correo la invitación no sirve: se revoca y se informa el error.
      await this.repository.revokeInProject(invitation.id, input.projectId);
      this.logger.error(
        `Invitation email failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
    return invitation;
  }

  private appUrl(): string {
    return (
      this.config.get<string>('APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }
}

@Injectable()
export class ListInvitationsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(INVITATIONS_REPOSITORY)
    private readonly repository: InvitationsRepository,
  ) {}

  async execute(input: { actorUserId: string; projectId: string }) {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_READ,
      input.projectId,
    );
    return this.repository.listPendingByProject(input.projectId);
  }
}

@Injectable()
export class RevokeInvitationUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(INVITATIONS_REPOSITORY)
    private readonly repository: InvitationsRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    invitationId: string;
  }) {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_INVITE,
      input.projectId,
    );
    const revoked = await this.repository.revokeInProject(
      input.invitationId,
      input.projectId,
    );
    if (!revoked) {
      throw new NotFoundException('Pending invitation not found');
    }
  }
}

// Público: datos para la pantalla "Te invitaron a…" antes de iniciar sesión.
@Injectable()
export class PreviewInvitationUseCase {
  constructor(
    @Inject(INVITATIONS_REPOSITORY)
    private readonly repository: InvitationsRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(token: string) {
    const invitation = await this.repository.findByTokenHash(
      hashInvitationToken(token),
    );
    // Inexistente, revocada, usada o vencida: la misma respuesta.
    if (
      !invitation ||
      invitation.status !== 'PENDING' ||
      isExpiredInvitation(invitation, new Date())
    ) {
      throw new NotFoundException('Invitation not found or expired');
    }
    const project = await this.projectRepository.findById(invitation.projectId);
    return {
      projectId: invitation.projectId,
      projectName: project?.name ?? '',
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }
}

@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    @Inject(INVITATIONS_REPOSITORY)
    private readonly repository: InvitationsRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  // Requiere sesión, y la sesión debe ser del MISMO correo invitado: un
  // enlace reenviado a otra persona no le da acceso.
  async execute(input: { actorUserId: string; token: string }) {
    const invitation = await this.repository.findByTokenHash(
      hashInvitationToken(input.token),
    );
    if (!invitation || invitation.status === 'REVOKED') {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status === 'ACCEPTED') {
      throw new ConflictException('This invitation was already used');
    }
    if (isExpiredInvitation(invitation, new Date())) {
      throw new BadRequestException(
        'This invitation expired; ask for a new one',
      );
    }

    const user = await this.userRepository.findById(input.actorUserId);
    if (!user || normalizeEmail(user.email) !== invitation.email) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }

    const result = await this.repository.accept(
      invitation.id,
      input.actorUserId,
      new Date(),
    );
    if (result === 'not_pending') {
      throw new ConflictException('This invitation was already used');
    }
    if (result === 'already_member') {
      throw new ConflictException('You are already a member of this project');
    }
    return { projectId: invitation.projectId, role: invitation.role };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
