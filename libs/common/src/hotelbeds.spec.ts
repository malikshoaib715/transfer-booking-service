import { createHash } from 'node:crypto';
import { describeHotelbedsError, hotelbedsHeaders, hotelbedsSignature } from './hotelbeds-auth';
import { toAges, toPaxBands } from './travellers';

describe('hotelbedsSignature', () => {
  it('is sha256(apiKey + secret + unix seconds) in hex', () => {
    const now = 1_794_870_000_123;
    const expected = createHash('sha256').update('keysecret1794870000').digest('hex');
    expect(hotelbedsSignature('key', 'secret', now)).toBe(expected);
    expect(hotelbedsHeaders('key', 'secret', now)).toMatchObject({
      'Api-key': 'key',
      'X-Signature': expected,
      Accept: 'application/json',
    });
  });

  it('changes every second', () => {
    expect(hotelbedsSignature('k', 's', 1_000)).not.toBe(hotelbedsSignature('k', 's', 2_000));
  });
});

describe('describeHotelbedsError', () => {
  it('reads the auth error shape', () => {
    expect(describeHotelbedsError(401, { error: 'Request signature verification failed' })).toBe(
      'HTTP 401: Request signature verification failed',
    );
  });

  it('reads the application error list', () => {
    expect(
      describeHotelbedsError(400, { errors: [{ code: 'E_REQUEST_PASTDATE', text: 'Past date' }] }),
    ).toBe('HTTP 400: E_REQUEST_PASTDATE Past date');
  });

  it('falls back to a body snippet', () => {
    expect(describeHotelbedsError(502, '<html>Bad Gateway</html>')).toBe(
      'HTTP 502: <html>Bad Gateway</html>',
    );
  });
});

describe('travellers', () => {
  it('splits travellers into Hotelbeds pax bands', () => {
    expect(toPaxBands({ adults: 2, childAges: [0, 2, 3, 11, 12] })).toEqual({
      adults: 3,
      children: 2,
      infants: 2,
    });
  });

  it('lists an age per traveller', () => {
    expect(toAges({ adults: 2, childAges: [5] })).toEqual([30, 30, 5]);
  });
});
