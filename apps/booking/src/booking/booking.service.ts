import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { lastValueFrom } from 'rxjs';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import {
  BookingRequestedEvent,
  BookingView,
  CreateBookingRequest,
  EVENTS,
  Offer,
  RpcResult,
  SUPPLIER,
} from '@app/contracts';
import { EVENTS_CLIENT } from '../config';
import { BookingEntity, BookingEventEntity } from '../db/entities';
import { isExpired, OfferCache } from '../search/offer-cache';

const PG_UNIQUE_VIOLATION = '23505';

const fail = (code: string, message: string, httpStatus: number): RpcResult<never> => ({
  ok: false,
  error: { code, message, httpStatus },
});

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(BookingEntity) private readonly bookings: Repository<BookingEntity>,
    @Inject(EVENTS_CLIENT) private readonly events: ClientProxy,
    private readonly dataSource: DataSource,
    private readonly cache: OfferCache,
  ) {}

  /**
   * Accepts a booking: validates it against the cached offer, stores it as
   * PENDING and publishes booking.requested. The supplier call happens
   * asynchronously in the worker, so this returns quickly.
   */
  async create(req: CreateBookingRequest): Promise<RpcResult<BookingView>> {
    if (req.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(req.idempotencyKey);
      if (existing) return { ok: true, data: existing };
    }

    const offer = await this.cache.getOffer(req.offerId);
    if (!offer || isExpired(offer, Date.now())) {
      return fail('OFFER_NOT_FOUND', 'Offer is unknown or has expired. Search again.', 404);
    }
    const invalid = validateAgainstOffer(req, offer);
    if (invalid) return fail('VALIDATION', invalid, 422);

    // Everything except the offer id and idempotency key is what the supplier needs.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { offerId: _offerId, idempotencyKey: _key, ...details } = req;

    const id = randomUUID();
    try {
      await this.dataSource.transaction(async (tx) => {
        await tx.save(
          tx.create(BookingEntity, {
            id,
            status: 'PENDING',
            supplier: offer.supplier,
            productType: offer.productType,
            offerId: offer.id,
            title: offer.title,
            priceAmount: offer.price.amount,
            priceCurrency: offer.price.currency,
            offer,
            request: details,
            idempotencyKey: req.idempotencyKey ?? null,
          }),
        );
        await tx.save(
          tx.create(BookingEventEntity, { bookingId: id, type: 'REQUESTED', detail: null }),
        );
      });
    } catch (err) {
      // Two requests raced with the same idempotency key: return the winner.
      if (
        req.idempotencyKey &&
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        const winner = await this.findByIdempotencyKey(req.idempotencyKey);
        if (winner) return { ok: true, data: winner };
      }
      throw err;
    }

    try {
      const event: BookingRequestedEvent = { bookingId: id };
      await lastValueFrom(this.events.emit(EVENTS.BOOKING_REQUESTED, event));
    } catch (err) {
      // The row is committed but the event was not published. Fail the booking
      // visibly rather than leave it PENDING forever.
      this.logger.error(`could not publish booking.requested for ${id}: ${(err as Error).message}`);
      await this.dataSource.transaction(async (tx) => {
        await tx.update(
          BookingEntity,
          { id },
          {
            status: 'FAILED',
            failureCode: 'PUBLISH_FAILED',
            failureReason: 'Could not enqueue the booking',
          },
        );
        await tx.save(
          tx.create(BookingEventEntity, { bookingId: id, type: 'FAILED', detail: null }),
        );
      });
    }

    return { ok: true, data: (await this.view(id))! };
  }

  async get(id: string): Promise<RpcResult<BookingView>> {
    const booking = await this.view(id);
    return booking
      ? { ok: true, data: booking }
      : fail('BOOKING_NOT_FOUND', 'No such booking', 404);
  }

  private async findByIdempotencyKey(key: string): Promise<BookingView | null> {
    const row = await this.bookings.findOne({
      where: { idempotencyKey: key },
      select: { id: true },
    });
    return row ? this.view(row.id) : null;
  }

  private async view(id: string): Promise<BookingView | null> {
    const b = await this.bookings.findOne({
      where: { id },
      relations: { events: true },
      order: { events: { id: 'ASC' } },
    });
    return b ? toBookingView(b) : null;
  }
}

export function validateAgainstOffer(req: CreateBookingRequest, offer: Offer): string | null {
  if (!req.travellers.some((t) => t.type === 'ADULT')) return 'At least one adult is required';
  if (offer.supplier !== SUPPLIER) return 'Offer belongs to a different supplier';
  return null;
}

export function toBookingView(b: BookingEntity): BookingView {
  return {
    id: b.id,
    status: b.status,
    supplier: b.supplier,
    productType: b.productType,
    offerId: b.offerId,
    title: b.title,
    price: { amount: b.priceAmount, currency: b.priceCurrency },
    supplierReference: b.supplierReference,
    failureCode: b.failureCode,
    failureReason: b.failureReason,
    attempts: b.attempts,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    events: (b.events ?? []).map((e) => ({
      type: e.type,
      at: e.createdAt.toISOString(),
      detail: e.detail,
    })),
  };
}
