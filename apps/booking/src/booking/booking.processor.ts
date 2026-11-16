import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import { DataSource } from 'typeorm';
import {
  BookingOutcomeEvent,
  EVENTS,
  RPC,
  SupplierBookRequest,
  SupplierBookResult,
  SupplierError,
} from '@app/contracts';
import { config, EVENTS_CLIENT, SUPPLIER_CLIENT } from '../config';
import { BookingEntity, BookingEventEntity } from '../db/entities';

export type ProcessOutcome =
  | { kind: 'done' }
  /** The supplier call failed in a way that is safe to repeat. */
  | { kind: 'retry'; error: SupplierError };

@Injectable()
export class BookingProcessor {
  private readonly logger = new Logger(BookingProcessor.name);

  constructor(
    @Inject(SUPPLIER_CLIENT) private readonly supplier: ClientProxy,
    @Inject(EVENTS_CLIENT) private readonly events: ClientProxy,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Runs one booking attempt. Idempotent with respect to redelivery: a booking
   * that already left PENDING is not sent to the supplier again.
   */
  async process(bookingId: string, attempt: number): Promise<ProcessOutcome> {
    const repo = this.dataSource.getRepository(BookingEntity);
    const booking = await repo.findOneBy({ id: bookingId });
    if (!booking) {
      this.logger.warn(`booking ${bookingId} not found; dropping event`);
      return { kind: 'done' };
    }
    if (booking.status !== 'PENDING') {
      this.logger.log(`booking ${bookingId} already ${booking.status}; skipping redelivery`);
      return { kind: 'done' };
    }
    await repo.update({ id: bookingId }, { attempts: attempt });

    const result = await this.callSupplier(booking);

    if (result.ok) {
      await this.dataSource.transaction(async (tx) => {
        await tx.update(
          BookingEntity,
          { id: bookingId },
          { status: 'CONFIRMED', supplierReference: result.booking.supplierReference },
        );
        await tx.save(
          tx.create(BookingEventEntity, {
            bookingId,
            type: 'CONFIRMED',
            detail: { attempt, ...result.booking },
          }),
        );
      });
      this.publish(EVENTS.BOOKING_CONFIRMED, {
        bookingId,
        supplier: booking.supplier,
        supplierReference: result.booking.supplierReference,
      });
      return { kind: 'done' };
    }

    if (result.error.retryable) return { kind: 'retry', error: result.error };

    await this.markFailed(bookingId, result.error.code, result.error.message, { attempt });
    return { kind: 'done' };
  }

  async recordRetry(bookingId: string, error: SupplierError, attempt: number, delayMs: number) {
    const events = this.dataSource.getRepository(BookingEventEntity);
    await events.save(
      events.create({
        bookingId,
        type: 'ATTEMPT_FAILED',
        detail: { attempt, code: error.code, message: error.message, retryInMs: delayMs },
      }),
    );
  }

  async markFailed(
    bookingId: string,
    code: string,
    reason: string,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    const booking = await this.dataSource.transaction(async (tx) => {
      const updated = await tx.update(
        BookingEntity,
        { id: bookingId, status: 'PENDING' },
        { status: 'FAILED', failureCode: code, failureReason: reason },
      );
      if (!updated.affected) return null;
      await tx.save(
        tx.create(BookingEventEntity, {
          bookingId,
          type: 'FAILED',
          detail: { code, message: reason, ...detail },
        }),
      );
      return tx.findOneBy(BookingEntity, { id: bookingId });
    });
    if (booking) {
      this.publish(EVENTS.BOOKING_FAILED, {
        bookingId,
        supplier: booking.supplier,
        failureCode: code,
        failureReason: reason,
      });
    }
  }

  private async callSupplier(booking: BookingEntity): Promise<SupplierBookResult> {
    const request: SupplierBookRequest = {
      bookingId: booking.id,
      offer: booking.offer,
      ...booking.request,
    };
    try {
      return await firstValueFrom(
        this.supplier
          .send<SupplierBookResult>(RPC.SUPPLIER_BOOK, request)
          .pipe(timeout(config.supplierBookRpcTimeoutMs)),
      );
    } catch (err) {
      // No reply from the adapter. The supplier may or may not have been
      // called, so this is NOT retried automatically: a blind retry could
      // create a second real booking.
      const timedOut = err instanceof TimeoutError;
      return {
        ok: false,
        error: {
          code: timedOut ? 'ADAPTER_TIMEOUT' : 'ADAPTER_ERROR',
          message: timedOut
            ? 'No reply from the supplier adapter; outcome unknown, needs manual reconciliation'
            : (err as Error).message,
          retryable: false,
        },
      };
    }
  }

  private publish(pattern: string, event: BookingOutcomeEvent): void {
    this.events.emit(pattern, event).subscribe({
      error: (err: Error) => this.logger.warn(`could not publish ${pattern}: ${err.message}`),
    });
  }
}
