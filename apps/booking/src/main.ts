import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { QUEUES } from '@app/contracts';
import { assertRetryTopology, eventServer, rmqUrl, rpcServer } from '@app/common';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  // Retry queues and the DLQ must exist before the first message can fail.
  await assertRetryTopology(
    rmqUrl(),
    QUEUES.BOOKING_EVENTS,
    QUEUES.BOOKING_EVENTS_DLQ,
    config.retryDelaysMs,
  );

  // Two RabbitMQ consumers and no HTTP listener: an auto-ack RPC queue for the
  // gateway and a manual-ack event queue for the booking lifecycle.
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>(rpcServer(QUEUES.BOOKING_RPC));
  app.connectMicroservice<MicroserviceOptions>(eventServer(QUEUES.BOOKING_EVENTS));
  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.init();

  new Logger('booking').log(
    `Consuming ${QUEUES.BOOKING_RPC} and ${QUEUES.BOOKING_EVENTS}; retry delays ${config.retryDelaysMs.join(', ')}ms`,
  );
}
void bootstrap();
