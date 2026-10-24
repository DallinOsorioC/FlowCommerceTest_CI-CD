import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../authorization/presentation/decorators/require-permission.decorator';
import { WebhooksUseCases } from '../application/webhooks.use-cases';
import { ALL_EVENTS, WEBHOOK_EVENTS } from '../domain/webhook';
import {
  CreatedWebhookDto,
  CreateWebhookDto,
  UpdateWebhookDto,
  WebhookDeliveryDto,
  WebhookDto,
  WebhookEventsDto,
  WebhookTestResultDto,
} from './webhooks.dto';

// Webhooks salientes del proyecto (Configuración → Integraciones). Solo OWNER
// y ADMIN. Cada envío va firmado con X-Flowcommerce-Signature (ver
// domain/signing.ts para verificarlo).
@ApiTags('webhooks')
@Controller({ path: 'projects/:projectId/webhooks', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class WebhooksController {
  constructor(private readonly useCases: WebhooksUseCases) {}

  // Antes que las rutas con :id para que "events" no se tome como un id.
  @Get('events')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Eventos a los que se puede suscribir un webhook' })
  @ApiOkResponse({ type: WebhookEventsDto })
  events(): WebhookEventsDto {
    return { events: [ALL_EVENTS, ...WEBHOOK_EVENTS] };
  }

  @Post()
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Registrar un webhook',
    description:
      'Requiere https (y un host público). El secreto de firma solo se devuelve en esta respuesta.',
  })
  @ApiCreatedResponse({ type: CreatedWebhookDto })
  async create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateWebhookDto,
  ): Promise<CreatedWebhookDto> {
    const { endpoint, secret } = await this.useCases.create({
      actorUserId: userId,
      projectId,
      ...dto,
    });
    return { ...endpoint, secret };
  }

  @Get()
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Webhooks del proyecto (sin el secreto)' })
  @ApiOkResponse({ type: [WebhookDto] })
  list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<WebhookDto[]> {
    return this.useCases.list({ actorUserId: userId, projectId });
  }

  @Patch(':webhookId')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Editar, pausar o reactivar un webhook' })
  @ApiOkResponse({ type: WebhookDto })
  @ApiNotFoundResponse()
  update(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('webhookId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<WebhookDto> {
    return this.useCases.update({
      actorUserId: userId,
      projectId,
      id,
      ...dto,
    });
  }

  @Post(':webhookId/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Generar un secreto de firma nuevo',
    description: 'El anterior deja de valer al instante.',
  })
  @ApiOkResponse({ type: CreatedWebhookDto })
  @ApiNotFoundResponse()
  async rotate(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('webhookId', ParseUUIDPipe) id: string,
  ): Promise<CreatedWebhookDto> {
    const { endpoint, secret } = await this.useCases.rotateSecret({
      actorUserId: userId,
      projectId,
      id,
    });
    return { ...endpoint, secret };
  }

  @Post(':webhookId/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Enviar un evento ping de prueba' })
  @ApiOkResponse({ type: WebhookTestResultDto })
  @ApiNotFoundResponse()
  test(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('webhookId', ParseUUIDPipe) id: string,
  ): Promise<WebhookTestResultDto> {
    return this.useCases.test({ actorUserId: userId, projectId, id });
  }

  @Get(':webhookId/deliveries')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Últimos 50 envíos del webhook' })
  @ApiOkResponse({ type: [WebhookDeliveryDto] })
  @ApiNotFoundResponse()
  deliveries(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('webhookId', ParseUUIDPipe) id: string,
  ): Promise<WebhookDeliveryDto[]> {
    return this.useCases.deliveries({ actorUserId: userId, projectId, id });
  }

  @Delete(':webhookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'Borrar un webhook y su historial de envíos' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('webhookId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.useCases.remove({ actorUserId: userId, projectId, id });
  }
}
