import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccessRequestStatus } from '@flowcommerce/types';

export class AccessRequestReceivedDto {
  @ApiProperty({
    example:
      'Request received. The project administrators will review it and contact you.',
  })
  message!: string;
}

export class AccessRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ example: 'nuevo.miembro@flowcommerce.com' })
  email!: string;

  @ApiProperty({
    enum: AccessRequestStatus,
    example: AccessRequestStatus.PENDING,
  })
  status!: AccessRequestStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cuándo se resolvió la solicitud',
  })
  atendidoEn!: Date | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Usuario que resolvió la solicitud',
  })
  atendidoPorUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}
