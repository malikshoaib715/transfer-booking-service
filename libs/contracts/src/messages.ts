import { BookingDetails, Offer, PublicOffer, Travellers } from './model';
import { ProductType, SearchCriteria, Supplier, SUPPLIER_QUEUE } from './product';

/** RabbitMQ queues. */
export const QUEUES = {
  /** Request/reply from the gateway to the booking service. */
  BOOKING_RPC: 'booking.rpc',
  /** Booking lifecycle and audit events, consumed with manual acks. */
  BOOKING_EVENTS: 'booking.events',
  BOOKING_EVENTS_DLQ: 'booking.events.dlq',
  /** Request/reply from the booking service to the supplier adapter. */
  SUPPLIER: SUPPLIER_QUEUE,
} as const;

/** Request/reply patterns (@MessagePattern). */
export const RPC = {
  SEARCH: 'search.execute',
  BOOKING_CREATE: 'booking.create',
  BOOKING_GET: 'booking.get',
  SUPPLIER_SEARCH: 'supplier.search',
  SUPPLIER_BOOK: 'supplier.book',
} as const;

/** Fire-and-forget event patterns (@EventPattern). */
export const EVENTS = {
  SEARCH_PERFORMED: 'search.performed',
  BOOKING_REQUESTED: 'booking.requested',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_FAILED: 'booking.failed',
} as const;

// ------------------------------------------------------------------ search

export interface SearchRequest {
  criteria: SearchCriteria;
  travellers: Travellers;
}

export type SupplierResultStatus = 'OK' | 'ERROR' | 'TIMEOUT';

export interface SearchResponse {
  searchId: string;
  supplier: Supplier;
  productType: ProductType;
  status: SupplierResultStatus;
  cached: boolean;
  tookMs: number;
  offers: PublicOffer[];
  error?: SupplierError;
}

export interface SearchPerformedEvent {
  searchId: string;
  supplier: Supplier;
  productType: ProductType;
  criteria: SearchCriteria;
  travellers: Travellers;
  status: SupplierResultStatus;
  cached: boolean;
  tookMs: number;
  offerCount: number;
  errorCode: string | null;
  at: string;
}

// ------------------------------------------------- supplier adapter contract

export interface SupplierSearchRequest {
  searchId: string;
  criteria: SearchCriteria;
  travellers: Travellers;
}

export interface SupplierError {
  /** Stable machine code, e.g. NOT_CONFIGURED, SUPPLIER_HTTP_422, NETWORK. */
  code: string;
  message: string;
  /**
   * True only when the supplier certainly did not act on the request
   * (connection refused, 429, 503), so repeating it is safe. Timeouts on
   * booking calls are deliberately NOT retryable.
   */
  retryable: boolean;
  httpStatus?: number;
}

export type SupplierSearchResult =
  { ok: true; offers: Offer[] } | { ok: false; error: SupplierError };

export type SupplierBookRequest = BookingDetails & {
  bookingId: string;
  offer: Offer;
};

export interface SupplierBooking {
  supplierReference: string;
  status: string;
  total: { amount: string; currency: string } | null;
}

export type SupplierBookResult =
  { ok: true; booking: SupplierBooking } | { ok: false; error: SupplierError };

// ---------------------------------------------------------------- bookings

export interface BookingRequestedEvent {
  bookingId: string;
}

export interface BookingOutcomeEvent {
  bookingId: string;
  supplier: Supplier;
  supplierReference?: string;
  failureCode?: string;
  failureReason?: string;
}

/** Envelope for RPC replies that can fail with a domain error. */
export type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; httpStatus: number } };
