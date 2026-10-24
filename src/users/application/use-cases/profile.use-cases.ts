import { Inject, Injectable } from '@nestjs/common';
import type { UserProfile } from '@flowcommerce/types';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import {
  USER_REPOSITORY,
  type UpdateUserProfileInput,
  type UserRepository,
} from '../../domain/repositories/user.repository';

// Perfil del propio usuario: el id sale SIEMPRE de la sesión, nunca del body ni
// de la ruta, así que nadie puede editar el perfil de otro.
@Injectable()
export class GetMyProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: string): Promise<UserProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.toProfile();
  }
}

@Injectable()
export class UpdateMyProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(
    userId: string,
    input: UpdateUserProfileInput,
  ): Promise<UserProfile> {
    const user = await this.userRepository.updateProfile(userId, {
      name: input.name,
      phone: input.phone,
      position: input.position,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.toProfile();
  }
}
