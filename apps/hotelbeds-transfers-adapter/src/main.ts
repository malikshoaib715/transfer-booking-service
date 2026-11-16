import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { QUEUES } from '@app/contracts';
import { rpcServer } from '@app/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    rpcServer(QUEUES.SUPPLIER),
  );
  app.enableShutdownHooks();
  await app.listen();
  new Logger('hotelbeds-transfers-adapter').log(`Listening on queue ${QUEUES.SUPPLIER}`);
}
void bootstrap();
