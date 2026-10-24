import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsUUID, MaxLength } from 'class-validator';

export class CreateAccessRequestDto {
  @ApiProperty({ format: 'uuid', example: 'c0a80121-...' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ example: 'nuevo.miembro@flowcommerce.com' })
  @IsEmail({}, { message: 'email debe ser una dirección válida' })
  @MaxLength(255)
  email!: string;
}
