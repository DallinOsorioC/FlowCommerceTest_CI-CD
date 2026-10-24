import { Module } from '@nestjs/common';
import { DrizzleUserRepository } from './infrastructure/drizzle/drizzle-user.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository';

// Módulo de usuarios: registra y exporta el repositorio para el resto de la app.
@Module({
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: DrizzleUserRepository,
    },
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
