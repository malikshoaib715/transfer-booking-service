import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BookingView, CreateBookingRequest, RPC } from '@app/contracts';
import { CreateBookingDto } from './dto/booking.dto';
import { BookingServiceClient } from './booking-service.client';

const RPC_TIMEOUT_MS = 10_000;

@ApiTags('bookings')
@Controller({ path: 'bookings', version: '1' })
export class BookingsController {
  constructor(private readonly bookingService: BookingServiceClient) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Book an offer returned by a search',
    description:
      'The booking is accepted as PENDING and confirmed with the supplier asynchronously. ' +
      'Poll GET /v1/bookings/{id} for the outcome.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Repeating a request with the same key returns the original booking',
  })
  @ApiResponse({ status: 202, description: 'Booking accepted' })
  @ApiResponse({ status: 404, description: 'Offer unknown or expired' })
  @ApiResponse({ status: 422, description: 'Booking does not fit the offer' })
  create(
    @Body() body: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BookingView> {
    const request: CreateBookingRequest = {
      ...body,
      idempotencyKey: idempotencyKey?.slice(0, 128) || undefined,
    };
    return this.bookingService.call<BookingView>(RPC.BOOKING_CREATE, request, RPC_TIMEOUT_MS);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Booking status and lifecycle history' })
  @ApiResponse({ status: 404, description: 'No such booking' })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<BookingView> {
    return this.bookingService.call<BookingView>(RPC.BOOKING_GET, id, RPC_TIMEOUT_MS);
  }
}
