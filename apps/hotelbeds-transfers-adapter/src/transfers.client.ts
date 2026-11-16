import { Injectable } from '@nestjs/common';
import {
  SupplierBookRequest,
  SupplierBookResult,
  SupplierSearchResult,
  TransferCriteria,
  Travellers,
} from '@app/contracts';
import {
  describeHotelbedsError,
  hotelbedsHeaders,
  NOT_CONFIGURED,
  supplierFetch,
  toAmount,
} from '@app/common';
import { availabilityPath, mapServices, toBookingBody } from './transfers.mapper';
import { HbTransferAvailabilityResponse, HbTransferBookingResponse } from './transfers.types';

const TEST_HOST = 'https://api.test.hotelbeds.com';

@Injectable()
export class TransfersClient {
  private readonly host = process.env.HOTELBEDS_BASE_URL ?? TEST_HOST;
  private readonly baseUrl = `${this.host}/transfer-api/1.0`;
  private readonly apiKey = process.env.HOTELBEDS_TRANSFERS_API_KEY ?? '';
  private readonly secret = process.env.HOTELBEDS_TRANSFERS_SECRET ?? '';
  private readonly searchTimeoutMs = Number(process.env.SUPPLIER_SEARCH_TIMEOUT_MS ?? 20_000);
  private readonly bookTimeoutMs = Number(process.env.SUPPLIER_BOOK_TIMEOUT_MS ?? 130_000);
  private readonly maxOffers = Number(process.env.MAX_OFFERS_PER_SUPPLIER ?? 20);

  private get configured() {
    return Boolean(this.apiKey && this.secret);
  }

  async search(criteria: TransferCriteria, travellers: Travellers): Promise<SupplierSearchResult> {
    if (!this.configured) {
      return { ok: false, error: NOT_CONFIGURED('HOTELBEDS_TRANSFERS_API_KEY / _SECRET') };
    }
    const res = await supplierFetch<HbTransferAvailabilityResponse | null>(
      {
        method: 'GET',
        url: `${this.baseUrl}${availabilityPath(criteria, travellers)}`,
        headers: hotelbedsHeaders(this.apiKey, this.secret),
        timeoutMs: this.searchTimeoutMs,
      },
      describeHotelbedsError,
    );
    if (!res.ok) return res;
    return { ok: true, offers: mapServices(res.data, this.maxOffers) };
  }

  async book(req: SupplierBookRequest): Promise<SupplierBookResult> {
    if (!this.configured) {
      return { ok: false, error: NOT_CONFIGURED('HOTELBEDS_TRANSFERS_API_KEY / _SECRET') };
    }
    if (this.host !== TEST_HOST && process.env.ALLOW_LIVE_BOOKINGS !== 'true') {
      return {
        ok: false,
        error: {
          code: 'LIVE_BOOKING_BLOCKED',
          message: 'Refusing to book outside the Hotelbeds test environment',
          retryable: false,
        },
      };
    }
    const res = await supplierFetch<HbTransferBookingResponse>(
      {
        method: 'POST',
        url: `${this.baseUrl}/bookings`,
        headers: hotelbedsHeaders(this.apiKey, this.secret),
        body: toBookingBody(req),
        timeoutMs: this.bookTimeoutMs,
      },
      describeHotelbedsError,
    );
    if (!res.ok) return res;

    const booking = res.data?.bookings?.[0];
    if (!booking?.reference) {
      return {
        ok: false,
        error: {
          code: 'UNEXPECTED_RESPONSE',
          message: 'Booking response did not contain a reference',
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      booking: {
        supplierReference: booking.reference,
        status: booking.status,
        total:
          booking.totalAmount !== undefined && booking.currency
            ? { amount: toAmount(booking.totalAmount), currency: booking.currency }
            : null,
      },
    };
  }
}
