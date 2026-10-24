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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import {
  DeleteAttachmentUseCase,
  DownloadAttachmentUseCase,
  ListAttachmentsUseCase,
  UploadAttachmentUseCase,
  type UploadedFileInput,
} from '../../application/use-cases/attachments.use-cases';
import { toAttachment } from '../../domain/attachment';
import {
  ATTACHMENT_MAX_BYTES,
  contentDisposition,
} from '../../domain/file-rules';
import {
  AttachmentDto,
  ListAttachmentsQueryDto,
  PaginatedAttachmentsDto,
  UploadAttachmentDto,
} from '../dto/attachment.dto';

// Archivos de leads y clientes. El guard exige al menos LEAD_READ (ser
// miembro); el caso de uso comprueba el permiso exacto según sea de un lead o
// de un cliente y según se lea o se escriba.
@ApiTags('attachments')
@Controller({ path: 'projects/:projectId/attachments', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class AttachmentsController {
  constructor(
    private readonly uploadAttachment: UploadAttachmentUseCase,
    private readonly listAttachments: ListAttachmentsUseCase,
    private readonly downloadAttachment: DownloadAttachmentUseCase,
    private readonly deleteAttachment: DeleteAttachmentUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.LEAD_READ)
  // El límite de multer corta la subida al pasar de 10 MB (413) sin leerla
  // entera en memoria.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Subir un archivo a un lead o cliente',
    description:
      'multipart/form-data con "file" y leadId o clientId. Máx. 10 MB. Imágenes, PDF, Office, texto, audio o video.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        leadId: { type: 'string', format: 'uuid' },
        clientId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiCreatedResponse({ type: AttachmentDto })
  @ApiBadRequestResponse({
    description:
      'Sin archivo, tipo no permitido o leadId/clientId mal enviados',
  })
  @ApiNotFoundResponse({
    description: 'Lead o cliente inexistente en este proyecto',
  })
  @ApiPayloadTooLargeResponse({ description: 'Más de 10 MB' })
  async upload(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file: UploadedFileInput | undefined,
  ): Promise<AttachmentDto> {
    const attachment = await this.uploadAttachment.execute({
      actorUserId: userId,
      projectId,
      leadId: dto.leadId,
      clientId: dto.clientId,
      file,
    });
    return toAttachment(attachment);
  }

  @Get()
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({
    summary: 'Archivos del proyecto, de un lead o de un cliente',
    description: 'Más recientes primero. Filtros: leadId, clientId.',
  })
  @ApiOkResponse({ type: PaginatedAttachmentsDto })
  async list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListAttachmentsQueryDto,
  ): Promise<PaginatedAttachmentsDto> {
    const result = await this.listAttachments.execute({
      actorUserId: userId,
      projectId,
      leadId: query.leadId,
      clientId: query.clientId,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: result.attachments.map(toAttachment),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  }

  // ?inline=true lo abre en el navegador (vista previa de imágenes y PDF).
  @Get(':attachmentId/download')
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({ summary: 'Descargar un archivo' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  async download(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { attachment, content } = await this.downloadAttachment.execute({
      actorUserId: userId,
      projectId,
      attachmentId,
    });
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': contentDisposition(
        attachment.fileName,
        inline === 'true' ? 'inline' : 'attachment',
      ),
      'Content-Length': String(content.length),
      // El navegador no debe "adivinar" otro tipo (p. ej. ejecutar HTML).
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(content);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({ summary: 'Borrar un archivo' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  @ApiConflictResponse({ description: 'Pertenece a un mensaje de WhatsApp' })
  async remove(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    await this.deleteAttachment.execute({
      actorUserId: userId,
      projectId,
      attachmentId,
    });
  }
}
