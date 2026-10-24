import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { Role } from '@flowcommerce/types';

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: Role, example: Role.ADMIN })
  @Transform(({ value }: { value: string }) => value?.toUpperCase())
  @IsEnum(Role)
  role!: Role;
}
