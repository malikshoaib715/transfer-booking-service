import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import {
  EVENTS,
  Offer,
  PRODUCT_TYPE,
  PublicOffer,
  RPC,
  SearchPerformedEvent,
  SearchRequest,
  SearchResponse,
  SUPPLIER,
  SupplierError,
  SupplierSearchRequest,
  SupplierSearchResult,
} from '@app/contracts';
import { stableHash } from '@app/common';
import { config, EVENTS_CLIENT, SUPPLIER_CLIENT } from '../config';
import { OfferCache } from './offer-cache';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(SUPPLIER_CLIENT) private readonly supplier: ClientProxy,
    @Inject(EVENTS_CLIENT) private readonly events: ClientProxy,
    private readonly cache: OfferCache,
  ) {}

  /**
   * Serves from Redis when the same criteria were searched recently, otherwise
   * asks the supplier adapter over RabbitMQ with a deadline. Supplier failures
   * come back as a status in the response rather than as an exception.
   */
  async search(req: SearchRequest): Promise<SearchResponse> {
    const searchId = randomUUID();
    const started = Date.now();
    const cacheKey = `${SUPPLIER}:${stableHash(req)}`;

    let offers: Offer[] = [];
    let status: SearchResponse['status'] = 'OK';
    let error: SupplierError | undefined;

    const cached = await this.cache.getSearch(cacheKey);
    if (cached) {
      offers = cached;
    } else {
      const request: SupplierSearchRequest = { searchId, ...req };
      try {
        const result = await firstValueFrom(
          this.supplier
            .send<SupplierSearchResult>(RPC.SUPPLIER_SEARCH, request)
            .pipe(timeout(config.supplierSearchRpcTimeoutMs)),
        );
        if (result.ok) {
          offers = result.offers;
          await this.cache.putSearch(cacheKey, offers);
        } else {
          status = result.error.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR';
          error = result.error;
        }
      } catch (err) {
        const timedOut = err instanceof TimeoutError;
        status = timedOut ? 'TIMEOUT' : 'ERROR';
        error = {
          code: timedOut ? 'ADAPTER_TIMEOUT' : 'ADAPTER_UNAVAILABLE',
          message: timedOut
            ? `Supplier adapter did not reply within ${config.supplierSearchRpcTimeoutMs}ms`
            : (err as Error).message,
          retryable: true,
        };
      }
    }

    const response: SearchResponse = {
      searchId,
      supplier: SUPPLIER,
      productType: PRODUCT_TYPE,
      status,
      cached: cached !== null,
      tookMs: Date.now() - started,
      offers: offers.map(toPublicOffer),
      ...(error ? { error } : {}),
    };
    this.audit(req, response);
    return response;
  }

  /** Audit is written asynchronously off the event queue so it never slows a search. */
  private audit(req: SearchRequest, res: SearchResponse): void {
    const event: SearchPerformedEvent = {
      searchId: res.searchId,
      supplier: res.supplier,
      productType: res.productType,
      criteria: req.criteria,
      travellers: req.travellers,
      status: res.status,
      cached: res.cached,
      tookMs: res.tookMs,
      offerCount: res.offers.length,
      errorCode: res.error?.code ?? null,
      at: new Date().toISOString(),
    };
    this.events.emit(EVENTS.SEARCH_PERFORMED, event).subscribe({
      error: (err: Error) => this.logger.warn(`could not publish search audit: ${err.message}`),
    });
  }
}

export function toPublicOffer(offer: Offer): PublicOffer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { supplierContext: _hidden, ...rest } = offer;
  return rest;
}
