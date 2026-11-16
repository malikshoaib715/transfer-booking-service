import {
  Offer,
  SupplierBookRequest,
  TransferCriteria,
  TransferPoint,
  Travellers,
} from '@app/contracts';
import { offerId, toAmount, toPaxBands } from '@app/common';
import { HbTransferAvailabilityResponse, HbTransferService } from './transfers.types';

const seg = (s: string) => encodeURIComponent(s);
const point = (p: TransferPoint) => `${p.type}/${seg(p.code)}`;

/**
 * GET /availability/{lang}/from/{type}/{code}/to/{type}/{code}/{outbound}[/{inbound}]/{adults}/{children}/{infants}
 */
export function availabilityPath(criteria: TransferCriteria, travellers: Travellers): string {
  const { adults, children, infants } = toPaxBands(travellers);
  const dates = [criteria.pickupDateTime, criteria.returnDateTime].filter(Boolean).join('/');
  return `/availability/en/from/${point(criteria.from)}/to/${point(criteria.to)}/${dates}/${adults}/${children}/${infants}`;
}

export function mapServices(
  response: HbTransferAvailabilityResponse | null,
  limit: number,
): Offer[] {
  // Hotelbeds answers 204 with an empty body when nothing is available.
  return (response?.services ?? [])
    .map(mapService)
    .sort((a, b) => Number(a.price.amount) - Number(b.price.amount))
    .slice(0, limit);
}

export function mapService(service: HbTransferService): Offer {
  const pickup = service.pickupInformation;
  const policies = service.cancellationPolicies ?? [];
  return {
    id: offerId('hbt', service.rateKey),
    supplier: 'HOTELBEDS_TRANSFERS',
    productType: 'TRANSFER',
    title: `${capitalise(service.transferType)} ${service.vehicle.name}: ${pickup.from.description} to ${pickup.to.description}`,
    price: { amount: toAmount(service.price.totalAmount), currency: service.price.currencyId },
    expiresAt: null,
    // A policy charging less than the full price means some refund is possible.
    refundable: policies.length ? policies.some((p) => p.amount < service.price.totalAmount) : null,
    cancellationPolicies: policies.map((p) => ({
      from: p.from,
      penalty: { amount: toAmount(p.amount), currency: p.currencyId },
    })),
    details: {
      kind: 'TRANSFER',
      transferType: service.transferType,
      direction: service.direction,
      vehicle: service.vehicle.name,
      category: service.category.name,
      from: pickup.from.description,
      to: pickup.to.description,
      pickupDate: pickup.date,
      pickupTime: pickup.time,
      minPax: service.minPaxCapacity ?? null,
      maxPax: service.maxPaxCapacity ?? null,
    },
    supplierContext: { rateKey: service.rateKey, direction: service.direction },
  };
}

export function toBookingBody(req: SupplierBookRequest) {
  const ctx = req.offer.supplierContext as { rateKey: string; direction: 'ARRIVAL' | 'DEPARTURE' };
  const lead = req.travellers[0];
  return {
    language: 'en',
    holder: {
      name: lead.givenName,
      surname: lead.familyName,
      email: req.contact.email,
      phone: req.contact.phone,
    },
    transfers: [
      {
        rateKey: ctx.rateKey,
        transferDetails: [{ type: 'FLIGHT', direction: ctx.direction, code: req.flightNumber }],
      },
    ],
    // Hotelbeds limits clientReference to 20 characters.
    clientReference: req.bookingId.replace(/-/g, '').slice(0, 20).toUpperCase(),
    welcomeMessage: `Welcome ${lead.givenName} ${lead.familyName}`,
    remark: `Booking ${req.bookingId}`,
  };
}

function capitalise(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
