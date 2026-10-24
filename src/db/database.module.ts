import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  createDatabaseConnection,
  type Database,
  type DatabaseConnection,
} from './index';
import { DATABASE_CLIENT } from './database.constants';

export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

// Módulo global de base de datos: expone el cliente Drizzle y cierra el pool
// al apagarse la aplicación (evita que el proceso quede colgado en los tests).
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DatabaseConnection => {
        const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
        return createDatabaseConnection(databaseUrl);
      },
    },
    {
      provide: DATABASE_CLIENT,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): Database => connection.db,
    },
  ],
  exports: [DATABASE_CLIENT, DATABASE_CONNECTION],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.client.end();
  }
}
