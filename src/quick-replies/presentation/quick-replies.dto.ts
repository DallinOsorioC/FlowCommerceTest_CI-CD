import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateQuickReplyDto {
  @ApiProperty({
    example: 'saludo',
    description:
      'Lo que el asesor escribe tras "/" (minúsculas, dígitos, - y _)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(41)
  shortcut!: string;

  @ApiProperty({ example: 'Saludo inicial' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiProperty({ example: 'Hola, gracias por escribirnos. ¿En qué le ayudo?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  content!: string;
}

export class UpdateQuickReplyDto extends PartialType(CreateQuickReplyDto) {}

export class QuickReplyDto {
  @ApiProperty() id!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty() shortcut!: string;
  @ApiProperty() title!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, nullable: true })
  createdByUserId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
