import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  NotificationCategory,
  NotificationEntity,
  NotificationType,
} from '@flowcommerce/types';
import { BooleanQuery } from '../../../common/dto/boolean-query.transform';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginationMetaDto } from '../../../leads/presentation/dto/paginated-leads.dto';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true = solo las no leídas' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsIn(Object.values(NotificationType))
  type?: NotificationType;

  @ApiPropertyOptional({
    enum: NotificationCategory,
    description:
      'Pestaña de la bandeja: agrupa varios tipos. Se combina con type.',
  })
  @IsOptional()
  @IsIn(Object.values(NotificationCategory))
  category?: NotificationCategory;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ example: 'Cotización COT-000028 pendiente de aprobación' })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({
    enum: NotificationEntity,
    nullable: true,
    description: 'Recurso al que lleva "Ver detalle"',
  })
  entityType!: NotificationEntity | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  entityId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;
}

export class PaginatedNotificationsDto {
  @ApiProperty({
    type: [NotificationDto],
    description: 'Más recientes primero',
  })
  data!: NotificationDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  @ApiProperty({
    example: 7,
    description: 'No leídas en total (para "7 sin leer")',
  })
  unreadCount!: number;
}

export class UnreadNotificationsDto {
  @ApiProperty({ example: 7 })
  unreadCount!: number;
}
