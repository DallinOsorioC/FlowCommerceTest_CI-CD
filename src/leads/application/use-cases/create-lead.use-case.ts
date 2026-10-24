import { Inject, Injectable } from '@nestjs/common';
import {
  ActivityType,
  LeadSource,
  LeadStage,
  NotificationEntity,
  NotificationType,
  Permission,
  type RecordOrigin,
} from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { NotificationPublisher } from '../../../notifications/application/notification-publisher';
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
} from '../../domain/repositories/lead.repository';
import {
  LEAD_REFERENCES_READER,
  type LeadReferencesReader,
} from '../../domain/repositories/lead-references.reader';
import { assertActiveReferences } from '../assert-active-references';
import { rethrowLeadReferenceError } from '../lead-reference-errors';

export interface CreateLeadInput {
  actorUserId: string;
  projectId: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  score: number;
  company?: string | null;
  source?: LeadSource | null;
  estimatedValue?: number | null;
  notes?: string | null;
  assignedUserId?: string | null;
  clientId?: string | null;
  interestProductId?: string | null;
  lastContactAt?: Date | null;
  contactPosition?: string | null;
  // Solo la integración de IA crea leads con origin AI.
  origin?: RecordOrigin;
}

@Injectable()
export class CreateLeadUseCase {
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

  // Crea un lead en el proyecto tras verificar el permiso LEAD_CREATE.
  // El projectId viene del contexto ya autorizado por el guard, nunca del body.
  // Referencias del body: el responsable se valida como miembro del proyecto;
  // cliente y producto los ata al proyecto la FK compuesta (→ 404 si no).
  async execute(input: CreateLeadInput): Promise<LeadEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_CREATE,
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

    let created: LeadEntity;
    try {
      created = await this.leadRepository.create({
        projectId: input.projectId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        stage: input.stage,
        score: input.score,
        company: input.company ?? null,
        source: input.source ?? null,
        estimatedValue: input.estimatedValue ?? null,
        notes: input.notes ?? null,
        assignedUserId: input.assignedUserId ?? null,
        clientId: input.clientId ?? null,
        interestProductId: input.interestProductId ?? null,
        lastContactAt: input.lastContactAt ?? null,
        contactPosition: input.contactPosition ?? null,
        origin: input.origin ?? 'MANUAL',
      });
    } catch (error) {
      rethrowLeadReferenceError(error);
    }

    await this.activity.record({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      type: ActivityType.LEAD_CREATED,
      title:
        created.origin === 'AI'
          ? `Lead ${created.name} registrado por la IA`
          : `Lead ${created.name} creado`,
      leadId: created.id,
      clientId: created.clientId,
      metadata: {
        stage: created.stage,
        source: created.source,
        origin: created.origin,
      },
    });

    // Avisar al responsable si se lo asignó otra persona.
    if (created.assignedUserId) {
      await this.notifications.notify({
        projectId: input.projectId,
        type: NotificationType.LEAD_ASSIGNED,
        title: `Te asignaron el lead ${created.name}`,
        entity: { type: NotificationEntity.LEAD, id: created.id },
        recipients: { userIds: [created.assignedUserId] },
        excludeUserId: input.actorUserId,
      });
    }
    return created;
  }
}
