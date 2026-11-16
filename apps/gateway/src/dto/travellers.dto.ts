import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, Max, Min } from 'class-validator';
import { Travellers } from '@app/contracts';

export class TravellersDto implements Travellers {
  @ApiProperty({ example: 2, minimum: 1, maximum: 9 })
  @IsInt()
  @Min(1)
  @Max(9)
  adults: number;

  @ApiProperty({ example: [7], description: 'Age of each child or infant', type: [Number] })
  @IsArray()
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  childAges: number[];
}
