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
  ApiConflictResponse,
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
import { QuickRepliesUseCases } from '../application/quick-replies.use-cases';
import {
  CreateQuickReplyDto,
  QuickReplyDto,
  UpdateQuickReplyDto,
} from './quick-replies.dto';

@ApiTags('quick-replies')
@Controller({ path: 'projects/:projectId/quick-replies', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class QuickRepliesController {
  constructor(private readonly useCases: QuickRepliesUseCases) {}

  @Get()
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiOperation({ summary: 'Respuestas rápidas del proyecto' })
  @ApiOkResponse({ type: [QuickReplyDto] })
  list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<QuickReplyDto[]> {
    return this.useCases.list({ actorUserId: userId, projectId });
  }

  @Post()
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiOperation({ summary: 'Crear una respuesta rápida' })
  @ApiCreatedResponse({ type: QuickReplyDto })
  @ApiConflictResponse({ description: 'El atajo ya existe' })
  create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateQuickReplyDto,
  ): Promise<QuickReplyDto> {
    return this.useCases.create({ actorUserId: userId, projectId, ...dto });
  }

  @Patch(':id')
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiOperation({ summary: 'Editar una respuesta rápida' })
  @ApiOkResponse({ type: QuickReplyDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'El atajo ya existe' })
  update(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuickReplyDto,
  ): Promise<QuickReplyDto> {
    return this.useCases.update({
      actorUserId: userId,
      projectId,
      id,
      ...dto,
    });
  }

  @Delete(':id')
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar una respuesta rápida' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.useCases.remove({ actorUserId: userId, projectId, id });
  }
}
