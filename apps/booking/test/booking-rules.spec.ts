import { Offer, SUPPLIER } from '@app/contracts';
import { validateAgainstOffer } from '../src/booking/booking.service';
import { isExpired, offerTtl } from '../src/search/offer-cache';
import { toPublicOffer } from '../src/search/search.service';

const now = Date.parse('2026-11-16T18:00:00Z');
const offer = (over: Partial<Offer> = {}): Offer =>
  ({
    id: 'abc_000000000000000000000000',
    supplier: SUPPLIER,
    title: 'x',
    price: { amount: '1.00', currency: 'GBP' },
    expiresAt: null,
    refundable: null,
    cancellationPolicies: [],
    details: {},
    supplierContext: { secret: 'supplier-only' },
    ...over,
  }) as Offer;
const adult = {
  type: 'ADULT' as const,
  title: 'mr' as const,
  givenName: 'A',
  familyName: 'B',
  dateOfBirth: '1990-01-01',
  gender: 'm' as const,
};
const request = (travellers = [adult]) =>
  ({ offerId: 'x', contact: { email: 'a@b.c', phone: '+10000000' }, travellers }) as Parameters<
    typeof validateAgainstOffer
  >[0];

describe('offer cache rules', () => {
  it('caps the offer TTL and never outlives the supplier expiry', () => {
    expect(offerTtl(offer(), now, 1800)).toBe(1800);
    expect(offerTtl(offer({ expiresAt: '2026-11-16T18:05:00Z' }), now, 1800)).toBe(300);
    expect(offerTtl(offer({ expiresAt: '2026-11-16T20:00:00Z' }), now, 1800)).toBe(1800);
    expect(offerTtl(offer({ expiresAt: '2026-11-16T17:00:00Z' }), now, 1800)).toBe(1);
  });

  it('detects expired offers', () => {
    expect(isExpired(offer(), now)).toBe(false);
    expect(isExpired(offer({ expiresAt: '2026-11-16T17:59:59Z' }), now)).toBe(true);
  });

  it('never exposes supplierContext publicly', () => {
    expect(toPublicOffer(offer())).not.toHaveProperty('supplierContext');
  });
});

describe('validateAgainstOffer', () => {
  it('accepts a booking with an adult', () => {
    expect(validateAgainstOffer(request(), offer())).toBeNull();
  });

  it('requires an adult', () => {
    expect(validateAgainstOffer(request([{ ...adult, type: 'CHILD' }] as never), offer())).toMatch(
      /adult/,
    );
  });

  it('rejects an offer from another supplier', () => {
    expect(validateAgainstOffer(request(), offer({ supplier: 'OTHER' as never }))).toMatch(
      /different supplier/,
    );
  });
});
