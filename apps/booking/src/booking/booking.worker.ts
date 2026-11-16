import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, ConsumeMessage } from 'amqplib';
import { BookingOutcomeEvent, BookingRequestedEvent, EVENTS, QUEUES } from '@app/contracts';
import { retriesSoFar, retryOrDeadLetter } from '@app/common';
import { config } from '../config';
import { BookingProcessor } from './booking.processor';

/**
 * Consumes the booking lifecycle events. Messages are acked manually:
 *  - success or a final (non-retryable) failure  -> ack
 *  - retryable failure with attempts left        -> parked in a retry queue
 *  - retryable failure, attempts exhausted       -> rejected to the DLQ
 */
@Controller()
export class BookingWorker {
  private readonly logger = new Logger(BookingWorker.name);

  constructor(private readonly processor: BookingProcessor) {}

  @EventPattern(EVENTS.BOOKING_REQUESTED)
  async onBookingRequested(@Payload() event: BookingRequestedEvent, @Ctx() ctx: RmqContext) {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as ConsumeMessage;
    const attempt = retriesSoFar(msg) + 1;

    let failure: { code: string; message: string };
    try {
      const outcome = await this.processor.process(event.bookingId, attempt);
      if (outcome.kind === 'done') {
        channel.ack(msg);
        return;
      }
      failure = outcome.error;
    } catch (err) {
      // Infrastructure failure on our side (database, broker). Nothing was
      // sent to the supplier after the failure point, so retrying is safe.
      failure = { code: 'INTERNAL', message: (err as Error).message };
      this.logger.error(
        `booking ${event.bookingId} attempt ${attempt} crashed: ${failure.message}`,
      );
    }

    const decision = retryOrDeadLetter(channel, msg, QUEUES.BOOKING_EVENTS, config.retryDelaysMs);
    try {
      if (decision.action === 'retry') {
        this.logger.warn(
          `booking ${event.bookingId} attempt ${attempt} failed (${failure.code}); retrying in ${decision.delayMs}ms`,
        );
        await this.processor.recordRetry(
          event.bookingId,
          { ...failure, retryable: true },
          attempt,
          decision.delayMs,
        );
      } else {
        this.logger.error(
          `booking ${event.bookingId} dead-lettered after ${decision.attempts} attempts (${failure.code})`,
        );
        await this.processor.markFailed(event.bookingId, 'RETRIES_EXHAUSTED', failure.message, {
          attempts: decision.attempts,
          lastCode: failure.code,
          deadLetterQueue: QUEUES.BOOKING_EVENTS_DLQ,
        });
      }
    } catch (err) {
      this.logger.error(`could not record retry state: ${(err as Error).message}`);
    }
  }

  /** Extension point: notifications, vouchers, invoicing would subscribe here. */
  @EventPattern(EVENTS.BOOKING_CONFIRMED)
  onBookingConfirmed(@Payload() event: BookingOutcomeEvent, @Ctx() ctx: RmqContext) {
    this.logger.log(
      `booking ${event.bookingId} confirmed by ${event.supplier}: ${event.supplierReference}`,
    );
    (ctx.getChannelRef() as Channel).ack(ctx.getMessage() as ConsumeMessage);
  }

  @EventPattern(EVENTS.BOOKING_FAILED)
  onBookingFailed(@Payload() event: BookingOutcomeEvent, @Ctx() ctx: RmqContext) {
    this.logger.warn(
      `booking ${event.bookingId} failed: ${event.failureCode} ${event.failureReason}`,
    );
    (ctx.getChannelRef() as Channel).ack(ctx.getMessage() as ConsumeMessage);
  }
}
