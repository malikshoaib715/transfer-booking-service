#!/usr/bin/env node
/**
 * Records a live sandbox response into the adapter test fixtures.
 *
 *   npm run fixtures:record        (reads credentials from .env)
 *
 * Then run the tests: expectations that check specific fixture values need
 * updating to match what the sandbox returned.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const env = process.env;
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const outbound = inDays(60);

async function save(path, res) {
  const text = await res.text();
  if (!res.ok) {
    console.error(`  x HTTP ${res.status}: ${text.slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }
  const json = text ? JSON.parse(text) : null;
  await writeFile(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ok -> ${path}`);
}

const hbHost = env.HOTELBEDS_BASE_URL ?? 'https://api.test.hotelbeds.com';

function hotelbedsHeaders(key, secret) {
  const signature = createHash('sha256')
    .update(`${key}${secret}${Math.floor(Date.now() / 1000)}`)
    .digest('hex');
  return {
    'Api-key': key,
    'X-Signature': signature,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

console.log('Hotelbeds Transfers availability');
if (!env.HOTELBEDS_TRANSFERS_API_KEY || !env.HOTELBEDS_TRANSFERS_SECRET) {
  console.log('  skipped (HOTELBEDS_TRANSFERS_API_KEY / _SECRET not set)');
} else {
  await save(
    'apps/hotelbeds-transfers-adapter/test/fixtures/availability.json',
    await fetch(
      `${hbHost}/transfer-api/1.0/availability/en/from/IATA/BCN/to/ATLAS/57/${outbound}T14:30:00/2/0/0`,
      {
        headers: hotelbedsHeaders(env.HOTELBEDS_TRANSFERS_API_KEY, env.HOTELBEDS_TRANSFERS_SECRET),
      },
    ),
  );
}
