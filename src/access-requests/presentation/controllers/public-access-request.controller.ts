import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLE } from '../../../common/config/throttle';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateAccessRequestUseCase } from '../../application/use-cases/create-access-request.use-case';
import { AccessRequestReceivedDto } from '../dto/access-request.dto';
import { CreateAccessRequestDto } from '../dto/create-access-request.dto';

// Solicitud de acceso pública: un no-miembro pide entrar a un tenant con su
// correo. No hay sesión: queda un PENDING que resolverán los OWNER/ADMIN.
@ApiTags('auth')
@Controller({ path: 'auth/access-requests', version: '1' })
export class PublicAccessRequestController {
  constructor(
    private readonly createAccessRequestUseCase: CreateAccessRequestUseCase,
  ) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle(THROTTLE.accessRequest)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Solicitar acceso a un proyecto',
    description:
      'Responde siempre 202 con el mismo cuerpo, exista o no una cuenta con ese correo o una solicitud pendiente (no revela qué correos están registrados). 404 solo si el proyecto no existe.',
  })
  @ApiAcceptedResponse({ type: AccessRequestReceivedDto })
  async createAccessRequest(
    @Body() dto: CreateAccessRequestDto,
  ): Promise<AccessRequestReceivedDto> {
    await this.createAccessRequestUseCase.execute({
      projectId: dto.projectId,
      email: dto.email,
    });
    return {
      message:
        'Request received. The project administrators will review it and contact you.',
    };
  }
}
