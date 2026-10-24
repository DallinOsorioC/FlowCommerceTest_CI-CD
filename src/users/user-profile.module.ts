import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import {
  DeleteMyAvatarUseCase,
  GetUserAvatarUseCase,
  UploadMyAvatarUseCase,
} from './application/use-cases/avatar.use-cases';
import {
  GetMyProfileUseCase,
  UpdateMyProfileUseCase,
} from './application/use-cases/profile.use-cases';
import { AvatarController } from './presentation/controllers/avatar.controller';
import { ProfileController } from './presentation/controllers/profile.controller';
import { UsersModule } from './users.module';

// Módulo aparte de UsersModule: AuthModule ya importa UsersModule, así que el
// controlador (que necesita el guard de AuthModule) no puede vivir en él sin
// crear una dependencia circular.
@Module({
  imports: [AuthModule, UsersModule, FilesModule],
  controllers: [ProfileController, AvatarController],
  providers: [
    GetMyProfileUseCase,
    UpdateMyProfileUseCase,
    UploadMyAvatarUseCase,
    DeleteMyAvatarUseCase,
    GetUserAvatarUseCase,
  ],
})
export class UserProfileModule {}
