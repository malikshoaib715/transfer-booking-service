/** Subset of the Hotelbeds APItude Transfers API (transfer-api/1.0) wire format. */

export interface HbTransferPoint {
  code: string;
  description: string;
  type: string;
}

export interface HbTransferService {
  id: number;
  direction: 'ARRIVAL' | 'DEPARTURE';
  transferType: 'PRIVATE' | 'SHARED';
  vehicle: { code: string; name: string };
  category: { code: string; name: string };
  pickupInformation: {
    from: HbTransferPoint;
    to: HbTransferPoint;
    date: string;
    time: string;
  };
  minPaxCapacity?: number;
  maxPaxCapacity?: number;
  price: { totalAmount: number; netAmount: number | null; currencyId: string };
  rateKey: string;
  cancellationPolicies?: { amount: number; from: string; currencyId: string }[];
  factsheetId?: number;
}

export interface HbTransferAvailabilityResponse {
  search?: unknown;
  services?: HbTransferService[];
}

export interface HbTransferBookingResponse {
  bookings: {
    reference: string;
    status: string;
    totalAmount?: number | string;
    currency?: string;
  }[];
}
