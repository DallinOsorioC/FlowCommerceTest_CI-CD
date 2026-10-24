import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { ConvertLeadToClientUseCase } from '../../application/use-cases/convert-lead-to-client.use-case';
import {
  ConvertLeadDto,
  ConvertLeadResponseDto,
} from '../dto/convert-lead.dto';

// Conversión Lead → Client. Vive en el módulo de clientes (que ya depende de
// leads) para no crear un ciclo entre módulos.
@ApiTags('clients')
@Controller({ path: 'projects/:projectId/leads', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class LeadConversionController {
  constructor(
    private readonly convertLeadToClientUseCase: ConvertLeadToClientUseCase,
  ) {}

  @Post(':leadId/convert')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permission.CLIENT_CREATE, Permission.LEAD_UPDATE)
  @ApiOperation({
    summary: 'Convertir un lead en cliente',
    description:
      'Crea el cliente con los datos del lead y vincula el lead (clientId), en una sola transacción; o, con clientId en el body, vincula el lead a un cliente existente sin crear otro. Con markAsWon=true mueve además el lead a WON. La respuesta incluye possibleDuplicates (mismo email o empresa) para que el frontend pueda avisar.',
  })
  @ApiCreatedResponse({ type: ConvertLeadResponseDto })
  @ApiBadRequestResponse({
    description: 'Body inválido o responsable que no es miembro del proyecto',
  })
  @ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
  @ApiForbiddenResponse({
    description: 'Requiere CLIENT_CREATE y LEAD_UPDATE en el proyecto',
  })
  @ApiNotFoundResponse({ description: 'El lead no existe en este proyecto' })
  @ApiConflictResponse({
    description: 'El lead ya tiene cliente, o el NIT ya existe',
  })
  async convert(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: ConvertLeadDto,
  ): Promise<ConvertLeadResponseDto> {
    const result = await this.convertLeadToClientUseCase.execute({
      actorUserId: userId,
      projectId,
      leadId,
      company: dto.company,
      taxId: dto.taxId,
      assignedUserId: dto.assignedUserId,
      markAsWon: dto.markAsWon,
      clientId: dto.clientId,
    });

    return {
      client: result.client.toClient(),
      lead: result.lead.toLead(),
      possibleDuplicates: result.possibleDuplicates.map((client) =>
        client.toClient(),
      ),
    };
  }
}
