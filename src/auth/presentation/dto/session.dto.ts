import { ApiProperty } from '@nestjs/swagger';
import { SafeUserDto } from './auth-response.dto';

export class SessionInfoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class SessionDto {
  @ApiProperty({ type: SafeUserDto })
  user!: SafeUserDto;

  @ApiProperty({ type: SessionInfoDto })
  session!: SessionInfoDto;
}
