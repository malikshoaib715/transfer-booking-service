import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import {
  ProductBookingFields,
  TransferCriteria,
  TransferPoint,
  TransferPointType,
} from '@app/contracts';

export const API_INFO = {
  title: 'Transfer Booking Service',
  description:
    'Searches and books airport and hotel transfers through the Hotelbeds APItude ' +
    'Transfers API (test environment). Personal learning project; sandbox data only.',
};

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export class TransferPointDto implements TransferPoint {
  @ApiProperty({ enum: ['IATA', 'ATLAS', 'GPS', 'PORT', 'STATION'], example: 'IATA' })
  @IsIn(['IATA', 'ATLAS', 'GPS', 'PORT', 'STATION'])
  type: TransferPointType;

  @ApiProperty({
    example: 'BCN',
    description: 'IATA code, Hotelbeds ATLAS hotel code, or "lat,lng" for GPS',
  })
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Za-z0-9.,-]+$/)
  code: string;
}

export class CriteriaDto implements TransferCriteria {
  @ApiProperty({ type: TransferPointDto })
  @ValidateNested()
  @Type(() => TransferPointDto)
  from: TransferPointDto;

  @ApiProperty({ type: TransferPointDto, example: { type: 'ATLAS', code: '57' } })
  @ValidateNested()
  @Type(() => TransferPointDto)
  to: TransferPointDto;

  @ApiProperty({ example: '2027-03-12T14:30:00', description: 'Local pickup date-time' })
  @Matches(LOCAL_DATE_TIME)
  pickupDateTime: string;

  @ApiPropertyOptional({ example: '2027-03-19T09:00:00', description: 'Return pickup' })
  @IsOptional()
  @Matches(LOCAL_DATE_TIME)
  returnDateTime?: string;
}

export class ProductBookingFieldsDto implements ProductBookingFields {
  @ApiProperty({ example: 'BA478', description: 'Flight the transfer meets or connects to' })
  @Matches(/^[A-Z0-9]{2,3}\d{1,4}$/)
  flightNumber: string;
}
