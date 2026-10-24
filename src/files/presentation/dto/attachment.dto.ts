import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { AttachmentSource } from '@flowcommerce/types';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginationMetaDto } from '../../../leads/presentation/dto/paginated-leads.dto';

// Campos de texto del multipart (el archivo va en "file").
export class UploadAttachmentDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lead dueño del archivo',
  })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Cliente dueño del archivo (en vez de leadId)',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class ListAttachmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  leadId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clientId!: string | null;

  @ApiProperty({ example: 'propuesta-firmada.pdf' })
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 182340 })
  sizeBytes!: number;

  @ApiProperty({
    enum: AttachmentSource,
    description: 'UPLOAD = subido desde el CRM; WHATSAPP = llegó en un mensaje',
  })
  source!: AttachmentSource;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;
}

export class PaginatedAttachmentsDto {
  @ApiProperty({ type: [AttachmentDto] })
  data!: AttachmentDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
