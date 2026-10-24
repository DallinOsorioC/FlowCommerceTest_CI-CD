import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LeadsModule } from '../leads/leads.module';
import { ProjectsModule } from '../projects/projects.module';
import { ConvertLeadToClientUseCase } from './application/use-cases/convert-lead-to-client.use-case';
import { CreateClientUseCase } from './application/use-cases/create-client.use-case';
import { DeleteClientUseCase } from './application/use-cases/delete-client.use-case';
import { GetClientStatsUseCase } from './application/use-cases/get-client-stats.use-case';
import { GetClientUseCase } from './application/use-cases/get-client.use-case';
import { ListClientsUseCase } from './application/use-cases/list-clients.use-case';
import { UpdateClientUseCase } from './application/use-cases/update-client.use-case';
import { CLIENTS_REPOSITORY } from './domain/repositories/client.repository';
import { DrizzleClientRepository } from './infrastructure/drizzle/drizzle-client.repository';
import { ClientsController } from './presentation/controllers/clients.controller';
import { LeadConversionController } from './presentation/controllers/lead-conversion.controller';

@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    ProjectsModule,
    LeadsModule,
    ActivityModule,
  ],
  controllers: [ClientsController, LeadConversionController],
  providers: [
    {
      provide: CLIENTS_REPOSITORY,
      useClass: DrizzleClientRepository,
    },
    CreateClientUseCase,
    ListClientsUseCase,
    GetClientUseCase,
    GetClientStatsUseCase,
    UpdateClientUseCase,
    DeleteClientUseCase,
    ConvertLeadToClientUseCase,
  ],
  exports: [CLIENTS_REPOSITORY],
})
export class ClientsModule {}
