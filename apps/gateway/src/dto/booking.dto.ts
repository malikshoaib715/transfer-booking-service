import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsIn,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { BookingContact, BookingTraveller } from '@app/contracts';
import { ProductBookingFieldsDto } from './product.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class BookingContactDto implements BookingContact {
  @ApiProperty({ example: 'traveller@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+442080160508', description: 'E.164' })
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone: string;
}

export class BookingTravellerDto implements BookingTraveller {
  @ApiProperty({ enum: ['ADULT', 'CHILD'], example: 'ADULT' })
  @IsIn(['ADULT', 'CHILD'])
  type: 'ADULT' | 'CHILD';

  @ApiProperty({ enum: ['mr', 'ms', 'mrs', 'miss', 'dr'], example: 'ms' })
  @IsIn(['mr', 'ms', 'mrs', 'miss', 'dr'])
  title: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr';

  @ApiProperty({ example: 'Amelia' })
  @IsString()
  @Length(1, 50)
  givenName: string;

  @ApiProperty({ example: 'Earhart' })
  @IsString()
  @Length(1, 50)
  familyName: string;

  @ApiProperty({ example: '1987-07-24' })
  @Matches(ISO_DATE)
  dateOfBirth: string;

  @ApiProperty({ enum: ['m', 'f'], example: 'f' })
  @IsIn(['m', 'f'])
  gender: 'm' | 'f';
}

/** Common booking fields; product-specific ones come from ProductBookingFieldsDto. */
export class CreateBookingDto extends ProductBookingFieldsDto {
  @ApiProperty({ example: 'abc_3f2a9c0d1e4b5a6f7c8d9e0f', description: 'Offer id from a search' })
  @Matches(/^[a-z]{3}_[a-f0-9]{24}$/)
  offerId: string;

  @ApiProperty({ type: BookingContactDto })
  @ValidateNested()
  @Type(() => BookingContactDto)
  contact: BookingContactDto;

  @ApiProperty({ type: [BookingTravellerDto] })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @Type(() => BookingTravellerDto)
  travellers: BookingTravellerDto[];
}
