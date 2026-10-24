import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { BadRequestException } from '../../../common/exceptions/domain.exceptions';
import {
  ListWhatsAppTemplatesUseCase,
  ManageWhatsAppTemplatesUseCase,
} from '../../application/use-cases/whatsapp-templates.use-cases';
import {
  CreatedWhatsAppTemplateDto,
  CreateWhatsAppTemplateDto,
} from '../dto/whatsapp-config.dto';
import { WhatsAppTemplateDto } from '../dto/whatsapp-template.dto';

@ApiTags('messages')
@Controller({ path: 'projects/:projectId/whatsapp/templates', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class WhatsAppTemplatesController {
  constructor(
    private readonly listTemplates: ListWhatsAppTemplatesUseCase,
    private readonly manageTemplates: ManageWhatsAppTemplatesUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiOperation({
    summary: 'Plantillas de WhatsApp aprobadas',
    description:
      'Las que el chat ofrece cuando la ventana de 24 h está cerrada. Se crean desde POST o en el WhatsApp Manager de Meta.',
  })
  @ApiOkResponse({ type: [WhatsAppTemplateDto] })
  @ApiServiceUnavailableResponse({
    description: 'Falta el id de la cuenta de WhatsApp Business o el token',
  })
  list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<WhatsAppTemplateDto[]> {
    return this.listTemplates.execute({ actorUserId: userId, projectId });
  }

  @Get('all')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Todas las plantillas con su estado de aprobación',
    description: 'Incluye PENDING y REJECTED. Solo OWNER y ADMIN.',
  })
  @ApiOkResponse({ type: [WhatsAppTemplateDto] })
  listAll(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<WhatsAppTemplateDto[]> {
    return this.manageTemplates.list({ actorUserId: userId, projectId });
  }

  @Post()
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Crear una plantilla y enviarla a revisión de Meta',
    description:
      'Queda PENDING hasta que Meta la apruebe. Con WHATSAPP_TEMPLATES_DRY_RUN=true no llama a Meta.',
  })
  @ApiCreatedResponse({ type: CreatedWhatsAppTemplateDto })
  create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateWhatsAppTemplateDto,
  ): Promise<CreatedWhatsAppTemplateDto> {
    return this.manageTemplates.create({
      actorUserId: userId,
      projectId,
      template: {
        name: dto.name,
        language: dto.language,
        category: dto.category,
        bodyText: dto.bodyText,
        bodyExamples: dto.bodyExamples ?? [],
      },
    });
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Borrar una plantilla (todos sus idiomas)' })
  @ApiNoContentResponse()
  async remove(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('name') name: string | undefined,
  ): Promise<void> {
    if (!name || !/^[a-z0-9_]{1,512}$/.test(name)) {
      throw new BadRequestException('Query param "name" is required');
    }
    await this.manageTemplates.remove({
      actorUserId: userId,
      projectId,
      name,
    });
  }
}
