import { ClientProviderOptions, RmqOptions, Transport } from '@nestjs/microservices';
import { QUEUES } from '@app/contracts';

export function rmqUrl(): string {
  return process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
}

/**
 * RPC queues are durable but carry a message TTL: a search request that waited
 * longer than its caller is prepared to wait is worthless, so it is dropped
 * rather than processed late.
 */
export const RPC_QUEUE_OPTIONS = {
  durable: true,
  arguments: { 'x-message-ttl': 30_000 },
};

/**
 * The event queue dead-letters rejected messages to the DLQ through the
 * default exchange. Publisher and consumer must declare identical arguments.
 */
export const EVENT_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': QUEUES.BOOKING_EVENTS_DLQ,
  },
};

export function rpcClient(name: string, queue: string): ClientProviderOptions {
  return {
    name,
    transport: Transport.RMQ,
    options: { urls: [rmqUrl()], queue, queueOptions: RPC_QUEUE_OPTIONS },
  };
}

export function eventClient(name: string, queue: string): ClientProviderOptions {
  return {
    name,
    transport: Transport.RMQ,
    options: { urls: [rmqUrl()], queue, queueOptions: EVENT_QUEUE_OPTIONS, persistent: true },
  };
}

/** RPC consumer: auto-ack, replies go to the caller's direct reply-to queue. */
export function rpcServer(queue: string, prefetchCount = 10): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: { urls: [rmqUrl()], queue, queueOptions: RPC_QUEUE_OPTIONS, prefetchCount },
  };
}

/** Event consumer: manual ack so failed messages can be retried or dead-lettered. */
export function eventServer(queue: string, prefetchCount = 5): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl()],
      queue,
      queueOptions: EVENT_QUEUE_OPTIONS,
      noAck: false,
      prefetchCount,
    },
  };
}
