import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  BookingView,
  CreateBookingRequest,
  RPC,
  RpcResult,
  SearchRequest,
  SearchResponse,
} from '@app/contracts';
import { BookingService } from './booking/booking.service';
import { SearchService } from './search/search.service';

/** Request/reply entry points called by the gateway. */
@Controller()
export class RpcController {
  constructor(
    private readonly searchService: SearchService,
    private readonly bookingService: BookingService,
  ) {}

  @MessagePattern(RPC.SEARCH)
  search(@Payload() req: SearchRequest): Promise<SearchResponse> {
    return this.searchService.search(req);
  }

  @MessagePattern(RPC.BOOKING_CREATE)
  createBooking(@Payload() req: CreateBookingRequest): Promise<RpcResult<BookingView>> {
    return this.bookingService.create(req);
  }

  @MessagePattern(RPC.BOOKING_GET)
  getBooking(@Payload() id: string): Promise<RpcResult<BookingView>> {
    return this.bookingService.get(id);
  }
}
