import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
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
  ApiConsumes,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import type { UploadedFileInput } from '../../../files/application/use-cases/attachments.use-cases';
import { AVATAR_MAX_BYTES } from '../../../files/domain/file-rules';
import {
  DeleteMyAvatarUseCase,
  GetUserAvatarUseCase,
  UploadMyAvatarUseCase,
} from '../../application/use-cases/avatar.use-cases';
import { UserProfileDto } from '../dto/profile.dto';

// Foto de perfil. Subir y quitar: solo la propia (users/me). Ver: la de
// cualquier compañero de proyecto (users/:userId/avatar), que es lo que
// devuelve `avatarUrl` en el perfil.
@ApiTags('users')
@Controller({ path: 'users', version: '1' })
@UseGuards(AuthenticatedGuard)
@ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
export class AvatarController {
  constructor(
    private readonly uploadMyAvatar: UploadMyAvatarUseCase,
    private readonly deleteMyAvatar: DeleteMyAvatarUseCase,
    private readonly getUserAvatar: GetUserAvatarUseCase,
  ) {}

  @Put('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Subir o cambiar mi foto de perfil',
    description:
      'multipart/form-data con "file": JPG, PNG o WebP de hasta 2 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiBadRequestResponse({ description: 'Sin imagen o formato no permitido' })
  upload(
    @CurrentUserId() userId: string,
    @UploadedFile() file: UploadedFileInput | undefined,
  ): Promise<UserProfileDto> {
    return this.uploadMyAvatar.execute(userId, file);
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar mi foto de perfil' })
  @ApiNoContentResponse()
  async remove(@CurrentUserId() userId: string): Promise<void> {
    await this.deleteMyAvatar.execute(userId);
  }

  @Get(':userId/avatar')
  @ApiOperation({
    summary: 'Foto de perfil de un usuario',
    description: 'Solo de uno mismo o de un compañero de algún proyecto.',
  })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Sin foto, o no comparten proyecto' })
  async get(
    @CurrentUserId() viewerId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const avatar = await this.getUserAvatar.execute(viewerId, userId);
    res.set({
      'Content-Type': avatar.mimeType,
      'Content-Length': String(avatar.content.length),
      'X-Content-Type-Options': 'nosniff',
      // La URL lleva ?v=<foto>, así que se puede cachear sin miedo.
      'Cache-Control': 'private, max-age=86400',
    });
    return new StreamableFile(avatar.content);
  }
}
