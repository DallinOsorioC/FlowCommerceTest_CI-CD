import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ClientsModule } from '../clients/clients.module';
import { LeadsModule } from '../leads/leads.module';
import { ProductsModule } from '../products/products.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { QUOTE_PDF_RENDERER } from './application/ports/quote-pdf.renderer';
import { QuoteDocumentBuilder } from './application/quote-document.builder';
import {
  GetQuotePdfUseCase,
  SendQuoteUseCase,
} from './application/use-cases/quote-document.use-cases';
import { PdfkitQuotePdfRenderer } from './infrastructure/pdf/pdfkit-quote-pdf.renderer';
import { QuoteItemsBuilder } from './application/quote-items.builder';
import { QuoteLifecycleEvents } from './application/quote-lifecycle.events';
import { QuoteSettingsReader } from './application/quote-settings.reader';
import { CreateQuoteUseCase } from './application/use-cases/create-quote.use-case';
import { DeleteQuoteUseCase } from './application/use-cases/delete-quote.use-case';
import { GetQuoteUseCase } from './application/use-cases/get-quote.use-case';
import { ListQuotesUseCase } from './application/use-cases/list-quotes.use-case';
import { UpdateQuoteStatusUseCase } from './application/use-cases/update-quote-status.use-case';
import { UpdateQuoteUseCase } from './application/use-cases/update-quote.use-case';
import { QUOTES_REPOSITORY } from './domain/repositories/quote.repository';
import { DrizzleQuoteRepository } from './infrastructure/drizzle/drizzle-quote.repository';
import { QuotesController } from './presentation/controllers/quotes.controller';

@Module({
  // LeadsModule, ClientsModule y ProductsModule se importan para reutilizar sus
  // repositorios: crear o editar una cotización exige comprobar que lead,
  // cliente y productos pertenecen al proyecto.
  imports: [
    AuthModule,
    AuthorizationModule,
    LeadsModule,
    ClientsModule,
    ProductsModule,
    ProjectsModule,
    NotificationsModule,
    UsersModule,
    ActivityModule,
  ],
  controllers: [QuotesController],
  providers: [
    {
      provide: QUOTES_REPOSITORY,
      useClass: DrizzleQuoteRepository,
    },
    QuoteSettingsReader,
    QuoteLifecycleEvents,
    QuoteItemsBuilder,
    CreateQuoteUseCase,
    ListQuotesUseCase,
    GetQuoteUseCase,
    UpdateQuoteUseCase,
    DeleteQuoteUseCase,
    UpdateQuoteStatusUseCase,
    QuoteDocumentBuilder,
    { provide: QUOTE_PDF_RENDERER, useClass: PdfkitQuotePdfRenderer },
    GetQuotePdfUseCase,
    SendQuoteUseCase,
  ],
  // CreateQuoteUseCase y QuoteLifecycleEvents los reutiliza integrations/
  // (cotizaciones de la IA y pago confirmado por Pagos).
  exports: [QUOTES_REPOSITORY, QuoteLifecycleEvents, CreateQuoteUseCase],
})
export class QuotesModule {}
