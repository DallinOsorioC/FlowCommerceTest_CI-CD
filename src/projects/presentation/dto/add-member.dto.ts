import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Role } from '@flowcommerce/types';

export class AddMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: Role, example: Role.MEMBER })
  @Transform(({ value }: { value: string }) => value?.toUpperCase())
  @IsEnum(Role)
  role!: Role;
}
