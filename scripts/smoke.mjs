#!/usr/bin/env node
/**
 * Live smoke test through the gateway.
 *
 *   npm run smoke              search only; exits non-zero unless the supplier answered OK
 *   npm run smoke -- --book    also books the cheapest offer and polls until it settles
 *
 * GATEWAY_URL overrides the default http://localhost:8082.
 */
const base = process.env.GATEWAY_URL ?? `http://localhost:${process.env.GATEWAY_PORT ?? 8082}`;
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const outbound = inDays(60);

const SEARCH = {
  criteria: {
    from: { type: 'IATA', code: 'BCN' },
    to: { type: 'ATLAS', code: '57' },
    pickupDateTime: `${outbound}T14:30:00`,
  },
  travellers: { adults: 2, childAges: [] },
};

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(json)}`);
    process.exit(1);
  }
  return json;
}

const search = await call('POST', '/v1/search', SEARCH);
const cheapest = search.offers[0];
console.log(
  `search ${search.searchId}: ${search.supplier} ${search.status}, ${search.offers.length} offers in ${search.tookMs}ms` +
    (search.cached ? ' (cached)' : '') +
    (cheapest
      ? `, cheapest ${cheapest.price.amount} ${cheapest.price.currency}: ${cheapest.title}`
      : '') +
    (search.error ? `\n  ${search.error.code}: ${search.error.message}` : ''),
);
if (search.status !== 'OK') process.exit(1);
if (!process.argv.includes('--book')) process.exit(0);
if (!cheapest) {
  console.error('No offers to book');
  process.exit(1);
}

const booking = await call(
  'POST',
  '/v1/bookings',
  {
    offerId: cheapest.id,
    contact: { email: 'sandbox.traveller@example.com', phone: '+442080160508' },
    travellers: [
      {
        type: 'ADULT',
        title: 'ms',
        givenName: 'Amelia',
        familyName: 'Earhart',
        dateOfBirth: '1987-07-24',
        gender: 'f',
      },
    ].concat(
      SEARCH.travellers.adults > 1
        ? [
            {
              type: 'ADULT',
              title: 'mr',
              givenName: 'George',
              familyName: 'Putnam',
              dateOfBirth: '1987-09-07',
              gender: 'm',
            },
          ]
        : [],
    ),
    ...{ flightNumber: 'BA478' },
  },
  { 'Idempotency-Key': `smoke-${search.searchId}` },
);
console.log(`booking ${booking.id} accepted (${booking.status})`);

for (let i = 0; i < 60; i++) {
  const b = await call('GET', `/v1/bookings/${booking.id}`);
  if (b.status !== 'PENDING') {
    console.log(
      `booking ${b.status}` +
        (b.supplierReference ? `, supplier reference ${b.supplierReference}` : '') +
        (b.failureCode ? `: ${b.failureCode} ${b.failureReason}` : '') +
        ` after ${b.attempts} attempt(s)\n  ` +
        b.events.map((e) => e.type).join(' > '),
    );
    process.exit(b.status === 'CONFIRMED' ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 2_000));
}
console.error('booking still PENDING after 2 minutes');
process.exit(1);
