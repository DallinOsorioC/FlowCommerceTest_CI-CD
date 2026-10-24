import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { QuoteStatus } from '@flowcommerce/types';

// Solo se acepta el status destino. El use-case decide si esa transición es
// válida y si exige QUOTE_APPROVE, de modo que el cliente no puede saltarse la
// aprobación declarando un estado final directamente.
export class UpdateQuoteStatusDto {
  @ApiProperty({ enum: QuoteStatus, example: QuoteStatus.PENDING_APPROVAL })
  @IsEnum(QuoteStatus)
  @IsNotEmpty()
  status!: QuoteStatus;
}
