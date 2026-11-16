import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { QUEUES } from '@app/contracts';
import { rpcClient } from '@app/common';
import { BOOKING_SERVICE, BookingServiceClient } from './booking-service.client';
import { BookingsController } from './bookings.controller';
import { HealthController } from './health.controller';
import { SearchController } from './search.controller';

@Module({
  imports: [ClientsModule.register([rpcClient(BOOKING_SERVICE, QUEUES.BOOKING_RPC)])],
  controllers: [SearchController, BookingsController, HealthController],
  providers: [BookingServiceClient],
})
export class AppModule {}
