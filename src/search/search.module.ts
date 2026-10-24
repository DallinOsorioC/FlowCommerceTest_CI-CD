import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { GlobalSearchUseCase } from './application/global-search.use-case';
import { SEARCH_REPOSITORY } from './domain/search';
import { DrizzleSearchRepository } from './infrastructure/drizzle/drizzle-search.repository';
import { SearchController } from './presentation/search.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [SearchController],
  providers: [
    { provide: SEARCH_REPOSITORY, useClass: DrizzleSearchRepository },
    GlobalSearchUseCase,
  ],
})
export class SearchModule {}
