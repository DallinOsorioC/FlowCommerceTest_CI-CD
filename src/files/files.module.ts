import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ClientsModule } from '../clients/clients.module';
import { LeadsModule } from '../leads/leads.module';
import { AttachmentStore } from './application/attachment-store';
import {
  DeleteAttachmentUseCase,
  DownloadAttachmentUseCase,
  ListAttachmentsUseCase,
  UploadAttachmentUseCase,
} from './application/use-cases/attachments.use-cases';
import { ATTACHMENTS_REPOSITORY } from './domain/attachment';
import { FILE_STORAGE } from './domain/file-storage';
import { DrizzleAttachmentsRepository } from './infrastructure/drizzle/drizzle-attachments.repository';
import { createFileStorage } from './infrastructure/storage/create-file-storage';
import { AttachmentsController } from './presentation/controllers/attachments.controller';

// Archivos: el almacenamiento (FILE_STORAGE_DRIVER; hoy disco local), los adjuntos de leads y
// clientes, y el servicio que usan WhatsApp (archivos recibidos y enviados) y
// la foto de perfil.
@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    LeadsModule,
    ClientsModule,
    ActivityModule,
  ],
  controllers: [AttachmentsController],
  providers: [
    // FILE_STORAGE_DRIVER decide la implementación (hoy solo "local").
    {
      provide: FILE_STORAGE,
      useFactory: createFileStorage,
      inject: [ConfigService],
    },
    { provide: ATTACHMENTS_REPOSITORY, useClass: DrizzleAttachmentsRepository },
    AttachmentStore,
    UploadAttachmentUseCase,
    ListAttachmentsUseCase,
    DownloadAttachmentUseCase,
    DeleteAttachmentUseCase,
  ],
  exports: [FILE_STORAGE, ATTACHMENTS_REPOSITORY, AttachmentStore],
})
export class FilesModule {}
