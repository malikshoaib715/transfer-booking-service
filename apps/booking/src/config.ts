import { parseRetryDelays } from '@app/common';

const int = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://booking:booking@localhost:5432/bookings',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** How long a supplier search result is served from cache. */
  searchCacheTtlSeconds: int('SEARCH_CACHE_TTL_SECONDS', 120),
  /** Upper bound on how long an offer stays bookable after a search. */
  offerTtlSeconds: int('OFFER_TTL_SECONDS', 1_800),
  /** Adapter HTTP timeout plus a margin for the RabbitMQ round trip. */
  supplierSearchRpcTimeoutMs: int('SUPPLIER_SEARCH_TIMEOUT_MS', 20_000) + 2_000,
  supplierBookRpcTimeoutMs: int('SUPPLIER_BOOK_TIMEOUT_MS', 130_000) + 35_000,
  retryDelaysMs: parseRetryDelays(process.env.BOOKING_RETRY_DELAYS_MS),
};

export const REDIS = Symbol('REDIS');
export const EVENTS_CLIENT = 'EVENTS_CLIENT';
export const SUPPLIER_CLIENT = 'SUPPLIER_CLIENT';
