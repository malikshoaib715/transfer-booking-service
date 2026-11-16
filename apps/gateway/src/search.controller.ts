import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RPC, SearchResponse } from '@app/contracts';
import { BookingServiceClient } from './booking-service.client';
import { SearchRequestDto } from './dto/search.dto';

const SEARCH_TIMEOUT_MS = Number(process.env.SUPPLIER_SEARCH_TIMEOUT_MS ?? 20_000) + 8_000;

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly bookingService: BookingServiceClient) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Search the supplier and return normalised offers',
    description:
      'A supplier failure or timeout is reported in `status` and `error` with HTTP 200, ' +
      'so callers can tell "no availability" apart from "supplier down".',
  })
  @ApiResponse({ status: 200, description: 'Normalised offers, cheapest first' })
  search(@Body() body: SearchRequestDto): Promise<SearchResponse> {
    return this.bookingService.send<SearchResponse>(RPC.SEARCH, body, SEARCH_TIMEOUT_MS);
  }
}
