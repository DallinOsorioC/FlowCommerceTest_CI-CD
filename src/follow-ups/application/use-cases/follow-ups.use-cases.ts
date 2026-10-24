import { Inject, Injectable } from '@nestjs/common';
import {
  ActivityType,
  Permission,
  type FollowUpStatus,
  type FollowUpType,
} from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import { assertAssignableMember } from '../../../projects/application/services/assignable-member';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../projects/domain/repositories/membership.repository';
import type { FollowUp } from '../../domain/follow-up';
import {
  FOLLOW_UPS_REPOSITORY,
  type FollowUpRepository,
  type ListFollowUpsFilter,
  type UpdateFollowUpInput,
} from '../../domain/repositories/follow-up.repository';

interface ActorInProject {
  actorUserId: string;
  projectId: string;
}

// Permisos: leer seguimientos = LEAD_READ (VIEWER incluido); crearlos,
// editarlos o completarlos = LEAD_UPDATE (OWNER, ADMIN, MEMBER).

@Injectable()
export class CreateFollowUpUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: FollowUpRepository,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  // Sin responsable explícito, queda asignado a quien lo crea.
  async execute(
    input: ActorInProject & {
      leadId: string;
      type: FollowUpType;
      title: string;
      notes?: string | null;
      dueAt: Date;
      assignedUserId?: string | null;
    },
  ): Promise<FollowUp> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_UPDATE,
      input.projectId,
    );
    const lead = await this.leadRepository.findByIdInProject(
      input.leadId,
      input.projectId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found in this project');
    }
    const assignedUserId =
      input.assignedUserId === undefined
        ? input.actorUserId
        : input.assignedUserId;
    await assertAssignableMember(
      this.membershipRepository,
      assignedUserId,
      input.projectId,
    );

    const created = await this.repository.create({
      projectId: input.projectId,
      leadId: input.leadId,
      type: input.type,
      title: input.title,
      notes: input.notes ?? null,
      dueAt: input.dueAt,
      assignedUserId,
      createdByUserId: input.actorUserId,
    });
    await this.activity.record({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      type: ActivityType.FOLLOW_UP_CREATED,
      title: `Seguimiento programado: ${created.title}`,
      leadId: lead.id,
      clientId: lead.clientId,
      metadata: {
        followUpId: created.id,
        followUpType: created.type,
        dueAt: created.dueAt,
      },
    });
    return created;
  }
}

@Injectable()
export class ListFollowUpsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: FollowUpRepository,
  ) {}

  async execute(input: ActorInProject & ListFollowUpsFilter) {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );
    return this.repository.listByProject(input.projectId, {
      leadId: input.leadId,
      status: input.status,
      assignedUserId: input.assignedUserId,
      dueFrom: input.dueFrom,
      dueTo: input.dueTo,
      overdue: input.overdue,
      page: input.page,
      limit: input.limit,
    });
  }
}

@Injectable()
export class GetFollowUpUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: FollowUpRepository,
  ) {}

  async execute(
    input: ActorInProject & { followUpId: string },
  ): Promise<FollowUp> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );
    const found = await this.repository.findByIdInProject(
      input.followUpId,
      input.projectId,
    );
    if (!found) {
      throw new NotFoundException('Follow-up not found in this project');
    }
    return found;
  }
}

@Injectable()
export class UpdateFollowUpUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: FollowUpRepository,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  // Edita un seguimiento PENDING o cambia su estado:
  //   - status DONE: se completa (completedAt = ahora, outcome opcional) y el
  //     lead registra "último contacto" (N3).
  //   - status CANCELLED: se cancela.
  // DONE y CANCELLED son finales: 409 si se intenta tocar uno así.
  async execute(
    input: ActorInProject & {
      followUpId: string;
      type?: FollowUpType;
      title?: string;
      notes?: string | null;
      dueAt?: Date;
      assignedUserId?: string | null;
      status?: FollowUpStatus;
      outcome?: string | null;
    },
  ): Promise<FollowUp> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_UPDATE,
      input.projectId,
    );
    const current = await this.repository.findByIdInProject(
      input.followUpId,
      input.projectId,
    );
    if (!current) {
      throw new NotFoundException('Follow-up not found in this project');
    }
    if (current.status !== 'PENDING') {
      throw new ConflictException(
        `Follow-up is already ${current.status}; create a new one instead`,
      );
    }
    await assertAssignableMember(
      this.membershipRepository,
      input.assignedUserId,
      input.projectId,
    );

    const now = new Date();
    const changes: UpdateFollowUpInput = {
      type: input.type,
      title: input.title,
      notes: input.notes,
      dueAt: input.dueAt,
      assignedUserId: input.assignedUserId,
      outcome: input.outcome,
    };
    if (input.status && input.status !== 'PENDING') {
      changes.status = input.status;
      changes.completedAt = input.status === 'DONE' ? now : null;
    }

    const updated = await this.repository.updatePendingInProject(
      input.followUpId,
      input.projectId,
      changes,
    );
    if (!updated) {
      // Otro usuario lo completó o canceló entre la lectura y la escritura.
      throw new ConflictException(
        'Follow-up changed concurrently; reload and retry',
      );
    }

    if (updated.status === 'DONE') {
      await this.leadRepository.touchLastContactInProject(
        updated.leadId,
        input.projectId,
        now,
      );
    }
    if (updated.status === 'DONE' || updated.status === 'CANCELLED') {
      await this.activity.record({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        type:
          updated.status === 'DONE'
            ? ActivityType.FOLLOW_UP_COMPLETED
            : ActivityType.FOLLOW_UP_CANCELLED,
        title:
          updated.status === 'DONE'
            ? `Seguimiento completado: ${updated.title}`
            : `Seguimiento cancelado: ${updated.title}`,
        leadId: updated.leadId,
        metadata: {
          followUpId: updated.id,
          followUpType: updated.type,
          outcome: updated.outcome,
        },
      });
    }
    return updated;
  }
}

@Injectable()
export class DeleteFollowUpUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: FollowUpRepository,
  ) {}

  async execute(input: ActorInProject & { followUpId: string }) {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_UPDATE,
      input.projectId,
    );
    const deleted = await this.repository.deleteInProject(
      input.followUpId,
      input.projectId,
    );
    if (!deleted) {
      throw new NotFoundException('Follow-up not found in this project');
    }
  }
}
