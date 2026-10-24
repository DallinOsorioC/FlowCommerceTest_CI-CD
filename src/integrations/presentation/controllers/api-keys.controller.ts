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
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import {
  CreateApiKeyUseCase,
  ListApiKeysUseCase,
  RevokeApiKeyUseCase,
} from '../../application/api-keys.use-cases';
import {
  ApiKeyDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from '../dto/integrations.dto';

// API keys del proyecto (Configuración → Integraciones). Solo OWNER y ADMIN.
@ApiTags('integrations')
@Controller({ path: 'projects/:projectId/api-keys', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class ApiKeysController {
  constructor(
    private readonly createApiKey: CreateApiKeyUseCase,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly revokeApiKey: RevokeApiKeyUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Crear una API key',
    description:
      'Para el servicio de IA. La integración actúa con los permisos de quien crea la clave. La clave completa solo se devuelve en esta respuesta.',
  })
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  async create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyDto> {
    const { apiKey, key } = await this.createApiKey.execute({
      actorUserId: userId,
      projectId,
      name: dto.name,
      scopes: dto.scopes,
    });
    return { ...apiKey, key };
  }

  @Get()
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({ summary: 'API keys del proyecto (sin la clave)' })
  @ApiOkResponse({ type: [ApiKeyDto] })
  list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ApiKeyDto[]> {
    return this.listApiKeys.execute({ actorUserId: userId, projectId });
  }

  @Delete(':keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Revocar una API key (deja de funcionar al instante)',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No existe o ya estaba revocada' })
  async revoke(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ): Promise<void> {
    await this.revokeApiKey.execute({ actorUserId: userId, projectId, keyId });
  }
}
