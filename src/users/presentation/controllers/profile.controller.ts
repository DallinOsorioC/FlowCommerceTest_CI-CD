import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import {
  GetMyProfileUseCase,
  UpdateMyProfileUseCase,
} from '../../application/use-cases/profile.use-cases';
import { UpdateProfileDto, UserProfileDto } from '../dto/profile.dto';

@ApiTags('users')
@Controller({ path: 'users/me', version: '1' })
@UseGuards(AuthenticatedGuard)
@ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
export class ProfileController {
  constructor(
    private readonly getMyProfileUseCase: GetMyProfileUseCase,
    private readonly updateMyProfileUseCase: UpdateMyProfileUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  @ApiOkResponse({ type: UserProfileDto })
  getMe(@CurrentUserId() userId: string): Promise<UserProfileDto> {
    return this.getMyProfileUseCase.execute(userId);
  }

  @Patch()
  @ApiOperation({
    summary: 'Editar nombre, teléfono y puesto del propio usuario',
  })
  @ApiOkResponse({ type: UserProfileDto })
  updateMe(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.updateMyProfileUseCase.execute(userId, {
      name: dto.name,
      phone: dto.phone,
      position: dto.position,
    });
  }
}
