import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { availabilityPath, mapServices, toBookingBody } from '../src/transfers.mapper';
import { HbTransferAvailabilityResponse } from '../src/transfers.types';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/availability.json'), 'utf8'),
) as HbTransferAvailabilityResponse;

describe('Hotelbeds Transfers mapper', () => {
  describe('availabilityPath', () => {
    const criteria = {
      from: { type: 'IATA' as const, code: 'BCN' },
      to: { type: 'ATLAS' as const, code: '57' },
      pickupDateTime: '2027-03-12T14:30:00',
    };

    it('builds the one-way path with pax bands', () => {
      expect(availabilityPath(criteria, { adults: 2, childAges: [1, 6, 14] })).toBe(
        '/availability/en/from/IATA/BCN/to/ATLAS/57/2027-03-12T14:30:00/3/1/1',
      );
    });

    it('inserts the return date-time for round trips', () => {
      expect(
        availabilityPath(
          { ...criteria, returnDateTime: '2027-03-19T09:00:00' },
          { adults: 1, childAges: [] },
        ),
      ).toBe(
        '/availability/en/from/IATA/BCN/to/ATLAS/57/2027-03-12T14:30:00/2027-03-19T09:00:00/1/0/0',
      );
    });

    it('URL-encodes GPS coordinates', () => {
      expect(
        availabilityPath(
          { ...criteria, to: { type: 'GPS', code: '41.3874,2.1686' } },
          { adults: 1, childAges: [] },
        ),
      ).toContain('/to/GPS/41.3874%2C2.1686/');
    });
  });

  describe('mapServices', () => {
    const offers = mapServices(fixture, 20);

    it('returns offers cheapest first', () => {
      expect(offers.map((o) => o.price)).toEqual([
        { amount: '24.28', currency: 'EUR' },
        { amount: '68.42', currency: 'EUR' },
      ]);
    });

    it('maps a private transfer onto the normalised offer', () => {
      const car = offers[1];
      expect(car).toMatchObject({
        supplier: 'HOTELBEDS_TRANSFERS',
        productType: 'TRANSFER',
        title: 'Private Car: Barcelona Airport to Barcelona Universal',
        expiresAt: null,
        details: {
          kind: 'TRANSFER',
          transferType: 'PRIVATE',
          direction: 'ARRIVAL',
          vehicle: 'Car',
          category: 'Premium',
          pickupDate: '2027-03-12',
          pickupTime: '14:30:00',
          minPax: 1,
          maxPax: 3,
        },
      });
      expect(car.id).toMatch(/^hbt_[a-f0-9]{24}$/);
      expect(car.supplierContext).toMatchObject({ direction: 'ARRIVAL' });
      expect(String(car.supplierContext.rateKey)).toContain('ARRIVAL|IATA|BCN|ATLAS|57');
    });

    it('treats a full-price cancellation policy as non-refundable', () => {
      const car = offers[1];
      expect(car.refundable).toBe(false);
      expect(car.cancellationPolicies).toEqual([
        { from: '2027-03-11T14:30:00', penalty: { amount: '68.42', currency: 'EUR' } },
      ]);
    });

    it('leaves refundability unknown when no policy is given', () => {
      expect(offers[0].refundable).toBeNull();
    });

    it('handles the empty 204 body', () => {
      expect(mapServices(null, 20)).toEqual([]);
    });
  });

  it('builds a booking with the lead traveller as holder', () => {
    const body = toBookingBody({
      bookingId: 'b0a1c2d3-e4f5-4000-8000-000000000001',
      offer: mapServices(fixture, 20)[1],
      contact: { email: 'amelia@example.com', phone: '+442080160508' },
      travellers: [
        {
          type: 'ADULT',
          title: 'ms',
          givenName: 'Amelia',
          familyName: 'Earhart',
          dateOfBirth: '1987-07-24',
          gender: 'f',
        },
      ],
      flightNumber: 'BA478',
    });
    expect(body.holder).toEqual({
      name: 'Amelia',
      surname: 'Earhart',
      email: 'amelia@example.com',
      phone: '+442080160508',
    });
    expect(body.transfers[0].transferDetails).toEqual([
      { type: 'FLIGHT', direction: 'ARRIVAL', code: 'BA478' },
    ]);
    expect(body.clientReference).toBe('B0A1C2D3E4F540008000');
    expect(body.clientReference.length).toBeLessThanOrEqual(20);
  });
});
