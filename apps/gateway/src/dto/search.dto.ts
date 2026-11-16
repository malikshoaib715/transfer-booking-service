import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { SearchRequest } from '@app/contracts';
import { CriteriaDto } from './product.dto';
import { TravellersDto } from './travellers.dto';

export class SearchRequestDto implements SearchRequest {
  @ApiProperty({ type: CriteriaDto })
  @ValidateNested()
  @Type(() => CriteriaDto)
  criteria: CriteriaDto;

  @ApiProperty({ type: TravellersDto })
  @ValidateNested()
  @Type(() => TravellersDto)
  travellers: TravellersDto;
}
