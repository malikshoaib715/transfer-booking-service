import { connect, Channel, ConsumeMessage } from 'amqplib';

/**
 * Retry with backoff on plain RabbitMQ (no delayed-message plugin).
 *
 *   work queue ──(handler fails, attempts left)──▶ retry queue for that delay
 *        ▲                                              │ message TTL expires
 *        └──────────── dead-lettered back ◀─────────────┘
 *   work queue ──(attempts exhausted: nack, requeue=false)──▶ DLQ
 *
 * One retry queue per delay keeps TTLs uniform inside a queue, which avoids
 * the head-of-line blocking that per-message TTLs cause.
 */

export const RETRY_HEADER = 'x-retry-count';

export function parseRetryDelays(raw: string | undefined, fallback = [5_000, 20_000, 60_000]) {
  if (!raw) return fallback;
  const delays = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return delays.length ? delays : fallback;
}

export function retryQueueName(queue: string, delayMs: number): string {
  return `${queue}.retry.${delayMs}ms`;
}

export type RetryDecision =
  | { action: 'retry'; attempt: number; delayMs: number; queue: string }
  | { action: 'dead-letter'; attempts: number };

/** Pure decision: given how many retries already happened, what next? */
export function decideRetry(retriesSoFar: number, queue: string, delays: number[]): RetryDecision {
  if (retriesSoFar >= delays.length) return { action: 'dead-letter', attempts: retriesSoFar + 1 };
  const delayMs = delays[retriesSoFar];
  return {
    action: 'retry',
    attempt: retriesSoFar + 1,
    delayMs,
    queue: retryQueueName(queue, delayMs),
  };
}

export function retriesSoFar(msg: Pick<ConsumeMessage, 'properties'>): number {
  const n = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Either parks the message in the next retry queue and acks the original, or,
 * when retries are exhausted, rejects it so the broker dead-letters it.
 */
export function retryOrDeadLetter(
  channel: Pick<Channel, 'sendToQueue' | 'ack' | 'nack'>,
  msg: ConsumeMessage,
  queue: string,
  delays: number[],
): RetryDecision {
  const decision = decideRetry(retriesSoFar(msg), queue, delays);
  if (decision.action === 'retry') {
    channel.sendToQueue(decision.queue, msg.content, {
      persistent: true,
      contentType: msg.properties.contentType,
      headers: { ...msg.properties.headers, [RETRY_HEADER]: decision.attempt },
    });
    channel.ack(msg);
  } else {
    channel.nack(msg, false, false);
  }
  return decision;
}

/** Declares the DLQ and one retry queue per delay. Idempotent. */
export async function assertRetryTopology(
  url: string,
  queue: string,
  deadLetterQueue: string,
  delays: number[],
): Promise<void> {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await channel.assertQueue(deadLetterQueue, { durable: true });
    for (const delayMs of new Set(delays)) {
      await channel.assertQueue(retryQueueName(queue, delayMs), {
        durable: true,
        arguments: {
          'x-message-ttl': delayMs,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': queue,
        },
      });
    }
    await channel.close();
  } finally {
    await connection.close();
  }
}
