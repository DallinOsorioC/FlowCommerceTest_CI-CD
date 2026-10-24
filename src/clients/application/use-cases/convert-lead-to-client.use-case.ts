import { Inject, Injectable } from '@nestjs/common';
import { ActivityType, LeadStage, Permission } from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../common/utils/postgres-error';
import type { LeadEntity } from '../../../leads/domain/entities/lead.entity';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import { assertAssignableMember } from '../../../projects/application/services/assignable-member';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../projects/domain/repositories/membership.repository';
import type { ClientEntity } from '../../domain/entities/client.entity';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../domain/repositories/client.repository';
import { normalizeTaxId } from '../../domain/normalize-tax-id';

export interface ConvertLeadToClientInput {
  actorUserId: string;
  projectId: string;
  leadId: string;
  // Datos que el lead no tiene o que se quieren corregir al convertir.
  company?: string | null;
  taxId?: string | null;
  assignedUserId?: string | null;
  // true = además mueve el lead a WON.
  markAsWon?: boolean;
  // Vincula a un cliente existente en vez de crear uno nuevo (evita duplicar
  // una empresa que ya es cliente).
  clientId?: string;
}

export interface ConvertLeadToClientResult {
  client: ClientEntity;
  lead: LeadEntity;
  // Otros clientes con el mismo email o empresa que el recién creado.
  possibleDuplicates: ClientEntity[];
}

@Injectable()
export class ConvertLeadToClientUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  // Convierte un lead en cliente: crea el cliente con los datos del lead
  // (sourceLeadId = lead) y vincula el lead a él EN UNA SOLA TRANSACCIÓN. Exige
  // crear clientes Y actualizar leads. El vínculo es condicional (solo si el
  // lead no tenía cliente), así que dos conversiones simultáneas no pueden
  // ganar ambas: la perdedora se revierte entera y responde 409.
  async execute(
    input: ConvertLeadToClientInput,
  ): Promise<ConvertLeadToClientResult> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.CLIENT_CREATE,
      input.projectId,
    );
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
    if (lead.clientId) {
      throw new ConflictException('Lead is already linked to a client');
    }

    if (input.clientId) {
      return this.linkToExistingClient(input, input.clientId, lead);
    }

    const assignedUserId =
      input.assignedUserId !== undefined
        ? input.assignedUserId
        : lead.assignedUserId;
    await assertAssignableMember(
      this.membershipRepository,
      assignedUserId,
      input.projectId,
    );

    let client: ClientEntity | null;
    try {
      client = await this.clientRepository.createFromLead({
        projectId: input.projectId,
        leadId: lead.id,
        leadStage: input.markAsWon ? LeadStage.WON : undefined,
        name: lead.name,
        company: input.company !== undefined ? input.company : lead.company,
        contactPosition: lead.contactPosition,
        taxId: normalizeTaxId(input.taxId ?? null),
        email: lead.email,
        phone: lead.phone,
        notes: null,
        assignedUserId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A client with that tax id already exists in this project',
        );
      }
      throw error;
    }

    if (!client) {
      // Otra conversión ganó la carrera (o el lead se borró): la transacción
      // ya se revirtió entera, no queda ningún cliente huérfano.
      throw new ConflictException('Lead is already linked to a client');
    }

    const linked = await this.leadRepository.findByIdInProject(
      lead.id,
      input.projectId,
    );
    if (!linked) {
      throw new NotFoundException('Lead not found in this project');
    }

    // Aviso informativo de posibles duplicados (nunca bloquea la conversión).
    const possibleDuplicates =
      await this.clientRepository.findPossibleDuplicatesInProject(
        input.projectId,
        {
          email: client.email,
          company: client.company,
          excludeId: client.id,
        },
      );

    await this.recordConversion(input, client, linked, true);
    return { client, lead: linked, possibleDuplicates };
  }

  // Vincula el lead a un cliente que YA existe en el proyecto: no se crea nada.
  private async linkToExistingClient(
    input: ConvertLeadToClientInput,
    clientId: string,
    lead: LeadEntity,
  ): Promise<ConvertLeadToClientResult> {
    if (
      input.company !== undefined ||
      input.taxId !== undefined ||
      input.assignedUserId !== undefined
    ) {
      throw new BadRequestException(
        'clientId cannot be combined with company, taxId or assignedUserId',
      );
    }

    const client = await this.clientRepository.findByIdInProject(
      clientId,
      input.projectId,
    );
    if (!client) {
      throw new NotFoundException('Client not found in this project');
    }
    if (!client.active) {
      throw new ConflictException('Client is inactive; reactivate it first');
    }

    let linked: LeadEntity | null;
    try {
      // Condicional (client_id IS NULL): dos vínculos simultáneos no pueden
      // ganar ambos.
      linked = await this.leadRepository.linkClientInProject(
        lead.id,
        input.projectId,
        client.id,
        input.markAsWon ? LeadStage.WON : undefined,
      );
    } catch (error) {
      // El cliente se borró entre la lectura y el vínculo (FK compuesta).
      if (isForeignKeyViolation(error)) {
        throw new NotFoundException('Client not found in this project');
      }
      throw error;
    }
    if (!linked) {
      throw new ConflictException('Lead is already linked to a client');
    }

    await this.recordConversion(input, client, linked, false);
    return { client, lead: linked, possibleDuplicates: [] };
  }

  private recordConversion(
    input: ConvertLeadToClientInput,
    client: ClientEntity,
    lead: LeadEntity,
    createdClient: boolean,
  ): Promise<void> {
    const clientName = client.company ?? client.name;
    return this.activity.record({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      type: ActivityType.LEAD_CONVERTED,
      title: createdClient
        ? `${lead.name} se convirtió en el cliente ${clientName}`
        : `${lead.name} se vinculó al cliente ${clientName}`,
      leadId: lead.id,
      clientId: client.id,
      metadata: { createdClient, markedAsWon: input.markAsWon === true },
    });
  }
}
