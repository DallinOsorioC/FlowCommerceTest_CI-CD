import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@flowcommerce/types';
import type { InvitationRole } from '../domain/invitation';

const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER, Role.VIEWER] as const;

export class CreateInvitationDto {
  @ApiProperty({ example: 'nuevo@empresa.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    enum: INVITABLE_ROLES,
    description: 'OWNER no se invita: se otorga cambiando el rol después.',
  })
  @IsIn(INVITABLE_ROLES)
  role!: InvitationRole;
}

export class InvitationTokenDto {
  @ApiProperty({ description: 'Token del enlace recibido por correo' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}

export class InvitationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: INVITABLE_ROLES }) role!: InvitationRole;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED'] }) status!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  invitedByUserId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) creadoEn!: Date;
}

export class InvitationPreviewDto {
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty({ example: 'Constructora Nova' }) projectName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: INVITABLE_ROLES }) role!: InvitationRole;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}

export class AcceptedInvitationDto {
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty({ enum: INVITABLE_ROLES }) role!: InvitationRole;
}
