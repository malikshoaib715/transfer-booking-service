/**
 * Normalised internal model.
 *
 * This file is supplier-agnostic. Everything specific to the product this
 * service sells (search criteria, offer details, extra booking fields) lives
 * in ./product.ts, and the supplier adapter maps the supplier's wire format
 * onto these types, so the booking service and gateway never see it.
 */
import { OfferDetails, ProductBookingFields, ProductType, Supplier } from './product';

/** Amounts are decimal strings ("123.45") to avoid float rounding on money. */
export interface Money {
  amount: string;
  currency: string;
}

export interface Travellers {
  /** Number of adult travellers (12+). */
  adults: number;
  /** Age of each child/infant traveller at time of travel. */
  childAges: number[];
}

export interface CancellationPolicy {
  /** ISO date-time from which the penalty applies. */
  from: string;
  penalty: Money;
}

export interface Offer {
  /** Internal offer id, deterministic for a given supplier offer. */
  id: string;
  supplier: Supplier;
  productType: ProductType;
  title: string;
  price: Money;
  /** ISO date-time after which the supplier no longer honours the offer. */
  expiresAt: string | null;
  /** null when the supplier does not say. */
  refundable: boolean | null;
  cancellationPolicies: CancellationPolicy[];
  details: OfferDetails;
  /**
   * Opaque supplier data needed to book this offer (offer id, rate key,
   * passenger ids). Kept server-side; stripped before offers leave the backend.
   */
  supplierContext: Record<string, unknown>;
}

export type PublicOffer = Omit<Offer, 'supplierContext'>;

export const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface BookingTraveller {
  type: 'ADULT' | 'CHILD';
  title: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr';
  givenName: string;
  familyName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  gender: 'm' | 'f';
}

export interface BookingContact {
  email: string;
  /** E.164, e.g. +442080160508 */
  phone: string;
}

/** What the booking service stores and later hands to the supplier adapter. */
export type BookingDetails = {
  contact: BookingContact;
  travellers: BookingTraveller[];
} & ProductBookingFields;

export type CreateBookingRequest = BookingDetails & {
  offerId: string;
  idempotencyKey?: string;
};

export interface BookingView {
  id: string;
  status: BookingStatus;
  supplier: Supplier;
  productType: ProductType;
  offerId: string;
  title: string;
  price: Money;
  supplierReference: string | null;
  failureCode: string | null;
  failureReason: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  events: { type: string; at: string; detail: Record<string, unknown> | null }[];
}
