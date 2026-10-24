import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../leads/presentation/dto/paginated-leads.dto';
import { ProductDto } from './product.dto';

export class PaginatedProductsDto {
  @ApiProperty({ type: ProductDto, isArray: true })
  data!: ProductDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
