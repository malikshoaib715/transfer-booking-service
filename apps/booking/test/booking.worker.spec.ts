import { RmqContext } from '@nestjs/microservices';
import type { ConsumeMessage } from 'amqplib';
import { RETRY_HEADER } from '@app/common';
import { BookingProcessor } from '../src/booking/booking.processor';
import { BookingWorker } from '../src/booking/booking.worker';

const retryable = { code: 'SUPPLIER_HTTP_503', message: 'HTTP 503', retryable: true };

function setup(retries: number, process: jest.Mock) {
  const channel = { sendToQueue: jest.fn(), ack: jest.fn(), nack: jest.fn() };
  const msg = {
    content: Buffer.from('{}'),
    properties: { headers: retries ? { [RETRY_HEADER]: retries } : {} },
  } as unknown as ConsumeMessage;
  const ctx = { getChannelRef: () => channel, getMessage: () => msg } as unknown as RmqContext;
  const processor = { process, recordRetry: jest.fn(), markFailed: jest.fn() };
  const worker = new BookingWorker(processor as unknown as BookingProcessor);
  return { channel, msg, ctx, processor, worker };
}

describe('BookingWorker', () => {
  it('acks when the attempt reached a final state', async () => {
    const t = setup(0, jest.fn().mockResolvedValue({ kind: 'done' }));
    await t.worker.onBookingRequested({ bookingId: 'b1' }, t.ctx);

    expect(t.processor.process).toHaveBeenCalledWith('b1', 1);
    expect(t.channel.ack).toHaveBeenCalledWith(t.msg);
    expect(t.channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('schedules a retry for a retryable supplier failure', async () => {
    const t = setup(1, jest.fn().mockResolvedValue({ kind: 'retry', error: retryable }));
    await t.worker.onBookingRequested({ bookingId: 'b1' }, t.ctx);

    expect(t.processor.process).toHaveBeenCalledWith('b1', 2);
    expect(t.channel.sendToQueue).toHaveBeenCalledWith(
      'booking.events.retry.20000ms',
      t.msg.content,
      expect.objectContaining({ headers: { [RETRY_HEADER]: 2 } }),
    );
    expect(t.channel.ack).toHaveBeenCalledWith(t.msg);
    expect(t.processor.recordRetry).toHaveBeenCalledWith('b1', retryable, 2, 20_000);
    expect(t.processor.markFailed).not.toHaveBeenCalled();
  });

  it('retries when processing itself crashes', async () => {
    const t = setup(0, jest.fn().mockRejectedValue(new Error('db down')));
    await t.worker.onBookingRequested({ bookingId: 'b1' }, t.ctx);

    expect(t.channel.sendToQueue).toHaveBeenCalledWith(
      'booking.events.retry.5000ms',
      t.msg.content,
      expect.anything(),
    );
    expect(t.processor.recordRetry).toHaveBeenCalledWith(
      'b1',
      { code: 'INTERNAL', message: 'db down', retryable: true },
      1,
      5_000,
    );
  });

  it('dead-letters and fails the booking once retries are exhausted', async () => {
    const t = setup(3, jest.fn().mockResolvedValue({ kind: 'retry', error: retryable }));
    await t.worker.onBookingRequested({ bookingId: 'b1' }, t.ctx);

    expect(t.channel.nack).toHaveBeenCalledWith(t.msg, false, false);
    expect(t.channel.ack).not.toHaveBeenCalled();
    expect(t.processor.markFailed).toHaveBeenCalledWith(
      'b1',
      'RETRIES_EXHAUSTED',
      'HTTP 503',
      expect.objectContaining({ attempts: 4, deadLetterQueue: 'booking.events.dlq' }),
    );
  });
});
