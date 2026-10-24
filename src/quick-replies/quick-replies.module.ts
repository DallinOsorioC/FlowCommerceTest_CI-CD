import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { QuickRepliesUseCases } from './application/quick-replies.use-cases';
import { QUICK_REPLIES_REPOSITORY } from './domain/quick-reply';
import { DrizzleQuickRepliesRepository } from './infrastructure/drizzle/drizzle-quick-replies.repository';
import { QuickRepliesController } from './presentation/quick-replies.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [QuickRepliesController],
  providers: [
    {
      provide: QUICK_REPLIES_REPOSITORY,
      useClass: DrizzleQuickRepliesRepository,
    },
    QuickRepliesUseCases,
  ],
})
export class QuickRepliesModule {}
