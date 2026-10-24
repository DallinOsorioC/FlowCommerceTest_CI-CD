import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import {
  DeleteWhatsAppConfigUseCase,
  GetWhatsAppConfigUseCase,
  SaveWhatsAppConfigUseCase,
  type WhatsAppConfigView,
} from '../../application/use-cases/whatsapp-config.use-cases';
import {
  SaveWhatsAppConfigDto,
  WhatsAppConfigDto,
} from '../dto/whatsapp-config.dto';

// Conexión de WhatsApp del proyecto (Configuración → WhatsApp). Solo OWNER y
// ADMIN. El token se cifra al guardar y NUNCA vuelve en una respuesta.
@ApiTags('messages')
@Controller({ path: 'projects/:projectId/whatsapp/config', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class WhatsAppConfigController {
  constructor(
    private readonly getConfig: GetWhatsAppConfigUseCase,
    private readonly saveConfig: SaveWhatsAppConfigUseCase,
    private readonly deleteConfig: DeleteWhatsAppConfigUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Conexión de WhatsApp del proyecto (sin el token)' })
  @ApiOkResponse({ type: WhatsAppConfigDto })
  get(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<WhatsAppConfigView> {
    return this.getConfig.execute({ actorUserId: userId, projectId });
  }

  @Put()
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Guardar o reemplazar la conexión de WhatsApp',
    description:
      'Requiere ENCRYPTION_KEY en el servidor. Un número solo puede pertenecer a un proyecto.',
  })
  @ApiOkResponse({ type: WhatsAppConfigDto })
  @ApiConflictResponse({ description: 'El número ya está en otro proyecto' })
  save(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SaveWhatsAppConfigDto,
  ): Promise<WhatsAppConfigView> {
    return this.saveConfig.execute({
      actorUserId: userId,
      projectId,
      phoneNumberId: dto.phoneNumberId,
      businessAccountId: dto.businessAccountId ?? null,
      token: dto.token,
    });
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Desconectar WhatsApp (borra el token guardado)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'El proyecto no tenía cuenta guardada' })
  async remove(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.deleteConfig.execute({ actorUserId: userId, projectId });
  }
}
