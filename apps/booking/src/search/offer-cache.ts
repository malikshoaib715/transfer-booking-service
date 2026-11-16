import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Offer } from '@app/contracts';
import { config, REDIS } from '../config';

/**
 * Redis holds two things: whole supplier search results keyed by a hash of the
 * criteria (short TTL), and individual offers keyed by id so a later booking
 * request can find the offer it refers to. Cache failures never fail a search.
 */
@Injectable()
export class OfferCache {
  private readonly logger = new Logger(OfferCache.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getSearch(key: string, now = Date.now()): Promise<Offer[] | null> {
    try {
      const raw = await this.redis.get(`search:${key}`);
      if (!raw) return null;
      return (JSON.parse(raw) as Offer[]).filter((o) => !isExpired(o, now));
    } catch (err) {
      this.logger.warn(`cache read failed: ${(err as Error).message}`);
      return null;
    }
  }

  async putSearch(key: string, offers: Offer[], now = Date.now()): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.set(`search:${key}`, JSON.stringify(offers), 'EX', config.searchCacheTtlSeconds);
      for (const offer of offers) {
        pipeline.set(`offer:${offer.id}`, JSON.stringify(offer), 'EX', offerTtl(offer, now));
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`cache write failed: ${(err as Error).message}`);
    }
  }

  async getOffer(id: string): Promise<Offer | null> {
    const raw = await this.redis.get(`offer:${id}`);
    return raw ? (JSON.parse(raw) as Offer) : null;
  }
}

export function isExpired(offer: Offer, now: number): boolean {
  return offer.expiresAt !== null && Date.parse(offer.expiresAt) <= now;
}

/** An offer is kept until the supplier expires it, capped by OFFER_TTL_SECONDS. */
export function offerTtl(offer: Offer, now: number, cap = config.offerTtlSeconds): number {
  if (!offer.expiresAt) return cap;
  const remaining = Math.floor((Date.parse(offer.expiresAt) - now) / 1000);
  return Math.max(1, Math.min(cap, remaining));
}
