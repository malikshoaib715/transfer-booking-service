import type { ConsumeMessage } from 'amqplib';
import {
  decideRetry,
  parseRetryDelays,
  RETRY_HEADER,
  retriesSoFar,
  retryOrDeadLetter,
  retryQueueName,
} from './retry';

const message = (headers?: Record<string, unknown>): ConsumeMessage =>
  ({
    content: Buffer.from('{"pattern":"booking.requested","data":{"bookingId":"b1"}}'),
    fields: {},
    properties: { headers, contentType: 'application/json' },
  }) as unknown as ConsumeMessage;

const fakeChannel = () => ({ sendToQueue: jest.fn(), ack: jest.fn(), nack: jest.fn() });

describe('retry policy', () => {
  const delays = [5_000, 20_000, 60_000];

  it('parses delays and falls back on bad input', () => {
    expect(parseRetryDelays('100, 200,300')).toEqual([100, 200, 300]);
    expect(parseRetryDelays(undefined)).toEqual(delays);
    expect(parseRetryDelays('abc,-5')).toEqual(delays);
  });

  it('escalates through the delays, then dead-letters', () => {
    expect(decideRetry(0, 'q', delays)).toEqual({
      action: 'retry',
      attempt: 1,
      delayMs: 5_000,
      queue: 'q.retry.5000ms',
    });
    expect(decideRetry(2, 'q', delays)).toMatchObject({ action: 'retry', delayMs: 60_000 });
    expect(decideRetry(3, 'q', delays)).toEqual({ action: 'dead-letter', attempts: 4 });
  });

  it('reads the retry count from headers', () => {
    expect(retriesSoFar(message())).toBe(0);
    expect(retriesSoFar(message({ [RETRY_HEADER]: 2 }))).toBe(2);
    expect(retriesSoFar(message({ [RETRY_HEADER]: 'junk' }))).toBe(0);
  });

  it('parks a failed message in the retry queue and acks the original', () => {
    const channel = fakeChannel();
    const msg = message({ [RETRY_HEADER]: 1, trace: 'abc' });

    const decision = retryOrDeadLetter(channel, msg, 'q', delays);

    expect(decision).toMatchObject({ action: 'retry', attempt: 2, delayMs: 20_000 });
    expect(channel.sendToQueue).toHaveBeenCalledWith(retryQueueName('q', 20_000), msg.content, {
      persistent: true,
      contentType: 'application/json',
      headers: { [RETRY_HEADER]: 2, trace: 'abc' },
    });
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('rejects without requeue once retries are exhausted', () => {
    const channel = fakeChannel();
    const msg = message({ [RETRY_HEADER]: 3 });

    expect(retryOrDeadLetter(channel, msg, 'q', delays)).toEqual({
      action: 'dead-letter',
      attempts: 4,
    });
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
