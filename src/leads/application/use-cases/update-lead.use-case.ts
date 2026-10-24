import { Inject, Injectable } from '@nestjs/common';
import {
  ActivityType,
  NotificationEntity,
  NotificationType,
  Permission,
  type LeadStage,
} from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { NotificationPublisher } from '../../../notifications/application/notification-publisher';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { assertAssignableMember } from '../../../projects/application/services/assignable-member';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../projects/domain/repositories/membership.repository';
import { LeadEntity } from '../../domain/entities/lead.entity';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
  type UpdateLeadInput as RepoUpdateLeadInput,
} from '../../domain/repositories/lead.repository';
import {
  LEAD_REFERENCES_READER,
  type LeadReferencesReader,
} from '../../domain/repositories/lead-references.reader';
import { assertActiveReferences } from '../assert-active-references';
import { rethrowLeadReferenceError } from '../lead-reference-errors';

export interface UpdateLeadInput extends RepoUpdateLeadInput {
  actorUserId: string;
  projectId: string;
  leadId: string;
}

// Etiquetas del frontend para el texto de la actividad.
const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Seguimiento',
  PROPOSAL: 'Cotización',
  NEGOTIATION: 'Negociación',
  WON: 'Ganado',
  LOST: 'Perdido',
};

@Injectable()
export class UpdateLeadUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
    @Inject(LEAD_REFERENCES_READER)
    private readonly referencesReader: LeadReferencesReader,
    private readonly notifications: NotificationPublisher,
    private readonly activity: ActivityRecorder,
  ) {}

  // Actualiza un lead tras verificar LEAD_UPDATE. El projectId se propaga al
  // repositorio, que lo aplica en el WHERE: un lead de otro tenant produce
  // null y por tanto un 404, nunca una modificación.
  async execute(input: UpdateLeadInput): Promise<LeadEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_UPDATE,
      input.projectId,
    );

    await assertAssignableMember(
      this.membershipRepository,
      input.assignedUserId,
      input.projectId,
    );
    await assertActiveReferences(this.referencesReader, input.projectId, {
      clientId: input.clientId,
      interestProductId: input.interestProductId,
    });

    // El estado anterior solo hace falta si cambian la etapa o el responsable:
    // para avisar al nuevo responsable una sola vez y para registrar en la
    // actividad el cambio real ("de Nuevo a Contactado"), no cada edición.
    const previous =
      input.assignedUserId !== undefined || input.stage !== undefined
        ? await this.leadRepository.findByIdInProject(
            input.leadId,
            input.projectId,
          )
        : null;
    const previousAssignee = previous?.assignedUserId;

    let updated: LeadEntity | null;
    try {
      updated = await this.leadRepository.updateInProject(
        input.leadId,
        input.projectId,
        {
          name: input.name,
          email: input.email,
          phone: input.phone,
          stage: input.stage,
          score: input.score,
          company: input.company,
          source: input.source,
          estimatedValue: input.estimatedValue,
          notes: input.notes,
          assignedUserId: input.assignedUserId,
          clientId: input.clientId,
          interestProductId: input.interestProductId,
          lastContactAt: input.lastContactAt,
          contactPosition: input.contactPosition,
        },
      );
    } catch (error) {
      rethrowLeadReferenceError(error);
    }

    if (!updated) {
      throw new NotFoundException('Lead not found');
    }

    if (previous && previous.stage !== updated.stage) {
      await this.activity.record({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        type: ActivityType.LEAD_STAGE_CHANGED,
        title: `Etapa de ${updated.name}: ${STAGE_LABELS[previous.stage]} → ${STAGE_LABELS[updated.stage]}`,
        leadId: updated.id,
        clientId: updated.clientId,
        metadata: { from: previous.stage, to: updated.stage },
      });
    }
    if (
      previous &&
      input.assignedUserId !== undefined &&
      previousAssignee !== updated.assignedUserId
    ) {
      await this.activity.record({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        type: ActivityType.LEAD_ASSIGNED,
        title: updated.assignedUser
          ? `${updated.name} asignado a ${updated.assignedUser.name}`
          : `${updated.name} quedó sin responsable`,
        leadId: updated.id,
        clientId: updated.clientId,
        metadata: {
          from: previousAssignee ?? null,
          to: updated.assignedUserId,
        },
      });
    }

    if (
      updated.assignedUserId &&
      input.assignedUserId &&
      previousAssignee !== updated.assignedUserId
    ) {
      await this.notifications.notify({
        projectId: input.projectId,
        type: NotificationType.LEAD_ASSIGNED,
        title: `Te asignaron el lead ${updated.name}`,
        entity: { type: NotificationEntity.LEAD, id: updated.id },
        recipients: { userIds: [updated.assignedUserId] },
        excludeUserId: input.actorUserId,
      });
    }

    return updated;
  }
}
