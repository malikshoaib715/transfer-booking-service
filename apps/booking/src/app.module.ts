import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { QUEUES } from '@app/contracts';
import { eventClient, rpcClient } from '@app/common';
import { BookingProcessor } from './booking/booking.processor';
import { BookingService } from './booking/booking.service';
import { BookingWorker } from './booking/booking.worker';
import { config, EVENTS_CLIENT, REDIS, SUPPLIER_CLIENT } from './config';
import { ENTITIES } from './db/entities';
import { Init1794870000000 } from './db/migrations/1794870000000-init';
import { OfferCache } from './search/offer-cache';
import { SearchAuditListener } from './search/search-audit.listener';
import { SearchService } from './search/search.service';
import { RpcController } from './rpc.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.databaseUrl,
      entities: ENTITIES,
      migrations: [Init1794870000000],
      migrationsRun: true,
      synchronize: false,
    }),
    TypeOrmModule.forFeature(ENTITIES),
    ClientsModule.register([
      rpcClient(SUPPLIER_CLIENT, QUEUES.SUPPLIER),
      eventClient(EVENTS_CLIENT, QUEUES.BOOKING_EVENTS),
    ]),
  ],
  controllers: [RpcController, BookingWorker, SearchAuditListener],
  providers: [
    { provide: REDIS, useFactory: () => new Redis(config.redisUrl, { maxRetriesPerRequest: 2 }) },
    OfferCache,
    SearchService,
    BookingService,
    BookingProcessor,
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onApplicationShutdown() {
    this.redis.disconnect();
  }
}
