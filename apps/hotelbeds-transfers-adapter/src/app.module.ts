import { Module } from '@nestjs/common';
import { TransfersClient } from './transfers.client';
import { TransfersController } from './transfers.controller';

@Module({ controllers: [TransfersController], providers: [TransfersClient] })
export class AppModule {}
