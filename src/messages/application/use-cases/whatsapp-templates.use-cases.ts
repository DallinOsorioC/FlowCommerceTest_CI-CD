import { Inject, Injectable } from '@nestjs/common';
import { MessageDirection, MessageType, Permission } from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import type { MessageEntity } from '../../domain/entities/message.entity';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';
import {
  WHATSAPP_GATEWAY,
  countTemplateParameters,
  renderTemplateBody,
  type CreatedWhatsAppTemplate,
  type CreateWhatsAppTemplateInput,
  type WhatsAppGateway,
  type WhatsAppTemplate,
} from '../../domain/ports/whatsapp.gateway';
import { recordMessageActivity } from '../message-activity';

// Plantillas aprobadas de la cuenta de WhatsApp Business del proyecto (las
// que se crean y aprueban en el WhatsApp Manager de Meta). Las pide el chat
// cuando la ventana de 24 h está cerrada.
@Injectable()
export class ListWhatsAppTemplatesUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsAppGateway,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<WhatsAppTemplate[]> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.WHATSAPP_SEND_MESSAGE,
      input.projectId,
    );
    return this.whatsappGateway.listTemplates(input.projectId);
  }
}

export interface SendTemplateMessageInput {
  actorUserId: string;
  projectId: string;
  leadId: string;
  templateName: string;
  language: string;
  // Valores de {{1}}, {{2}}… del cuerpo, en orden.
  parameters: string[];
}

// Envía una plantilla aprobada. Es lo que permite retomar la conversación con
// un cliente que no escribió en las últimas 24 h (con texto libre, Meta la
// rechaza con el error 131047).
@Injectable()
export class SendTemplateMessageUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsAppGateway,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: SendTemplateMessageInput): Promise<MessageEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.WHATSAPP_SEND_MESSAGE,
      input.projectId,
    );

    const lead = await this.leadRepository.findByIdInProject(
      input.leadId,
      input.projectId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found in this project');
    }
    if (!lead.phone) {
      throw new ConflictException(
        'Lead has no phone number, WhatsApp message not sent',
      );
    }

    // Se valida contra las plantillas reales de Meta: nombre, idioma y número
    // de variables. Así el error sale aquí (400/404) y no como un FAILED.
    const templates = await this.whatsappGateway.listTemplates(input.projectId);
    const template = templates.find(
      (item) =>
        item.name === input.templateName && item.language === input.language,
    );
    if (!template) {
      throw new NotFoundException(
        `Template ${input.templateName} (${input.language}) not found or not approved`,
      );
    }
    if (template.headerNeedsParameters) {
      throw new ConflictException(
        'Templates with a media or variable header are not supported yet',
      );
    }
    if (input.parameters.length !== template.bodyParameterCount) {
      throw new BadRequestException(
        `Template ${template.name} needs ${template.bodyParameterCount} parameter(s), got ${input.parameters.length}`,
      );
    }

    const sent = await this.whatsappGateway.sendTemplate({
      projectId: input.projectId,
      leadId: lead.id,
      phone: lead.phone,
      templateName: template.name,
      language: template.language,
      bodyParameters: input.parameters,
    });

    const message = await this.messagesRepository.create({
      projectId: input.projectId,
      leadId: lead.id,
      whatsappMessageId: sent.whatsappMessageId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEMPLATE,
      templateName: template.name,
      content: renderTemplateBody(
        template.bodyText,
        input.parameters,
        template.name,
      ),
      status: sent.status,
    });
    await this.leadRepository.touchLastContactInProject(
      lead.id,
      input.projectId,
      message.creadoEn,
    );
    await recordMessageActivity(
      this.activity,
      lead,
      message,
      input.actorUserId,
    );
    return message;
  }
}

// Gestión de plantillas desde el CRM (en vez de entrar al WhatsApp Manager).
// Solo OWNER y ADMIN (PROJECT_UPDATE): una plantilla de marketing tiene costo.
@Injectable()
export class ManageWhatsAppTemplatesUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsAppGateway,
  ) {}

  // Todas las plantillas, con su estado (PENDING, APPROVED, REJECTED…).
  async list(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<WhatsAppTemplate[]> {
    await this.assertCanManage(input.actorUserId, input.projectId);
    return this.whatsappGateway.listTemplates(input.projectId, {
      allStatuses: true,
    });
  }

  async create(input: {
    actorUserId: string;
    projectId: string;
    template: CreateWhatsAppTemplateInput;
  }): Promise<CreatedWhatsAppTemplate> {
    await this.assertCanManage(input.actorUserId, input.projectId);
    const declared = countTemplateParameters(input.template.bodyText);
    if (input.template.bodyExamples.length < declared) {
      throw new BadRequestException(
        `Meta requires one example per variable: the body uses ${declared} and ${input.template.bodyExamples.length} were given`,
      );
    }
    return this.whatsappGateway.createTemplate(input.projectId, input.template);
  }

  async remove(input: {
    actorUserId: string;
    projectId: string;
    name: string;
  }): Promise<void> {
    await this.assertCanManage(input.actorUserId, input.projectId);
    await this.whatsappGateway.deleteTemplate(input.projectId, input.name);
  }

  private assertCanManage(actorUserId: string, projectId: string) {
    return this.authorizationService.assertCan(
      actorUserId,
      Permission.PROJECT_UPDATE,
      projectId,
    );
  }
}
