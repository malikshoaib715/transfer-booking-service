/**
 * Product-specific part of the model: airport and hotel transfers sold
 * through the Hotelbeds APItude Transfers API. Everything else in
 * libs/contracts is supplier-agnostic.
 */

export const SUPPLIER = 'HOTELBEDS_TRANSFERS' as const;
export type Supplier = typeof SUPPLIER;

export const PRODUCT_TYPE = 'TRANSFER' as const;
export type ProductType = typeof PRODUCT_TYPE;

export const SUPPLIER_QUEUE = 'supplier.hotelbeds-transfers';

export type TransferPointType = 'IATA' | 'ATLAS' | 'GPS' | 'PORT' | 'STATION';

export interface TransferPoint {
  type: TransferPointType;
  /** IATA code, Hotelbeds ATLAS hotel code, or "lat,lng" for GPS. */
  code: string;
}

export interface TransferCriteria {
  from: TransferPoint;
  to: TransferPoint;
  /** Local date-time of the outbound pickup, YYYY-MM-DDTHH:mm:ss. */
  pickupDateTime: string;
  /** Local date-time of the return pickup for round trips. */
  returnDateTime?: string;
}

export interface TransferDetails {
  kind: 'TRANSFER';
  transferType: 'PRIVATE' | 'SHARED';
  direction: 'ARRIVAL' | 'DEPARTURE';
  vehicle: string;
  category: string;
  from: string;
  to: string;
  pickupDate: string;
  pickupTime: string;
  minPax: number | null;
  maxPax: number | null;
}

export type SearchCriteria = TransferCriteria;
export type OfferDetails = TransferDetails;

export interface ProductBookingFields {
  /** Flight the transfer meets (arrival) or connects to (departure). */
  flightNumber: string;
}
