import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import type { Channel, ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { EVENTS, QUEUES, SearchPerformedEvent } from '@app/contracts';
import { retryOrDeadLetter } from '@app/common';
import { config } from '../config';
import { SearchAuditEntity } from '../db/entities';

@Controller()
export class SearchAuditListener {
  private readonly logger = new Logger(SearchAuditListener.name);

  constructor(
    @InjectRepository(SearchAuditEntity) private readonly audit: Repository<SearchAuditEntity>,
  ) {}

  @EventPattern(EVENTS.SEARCH_PERFORMED)
  async onSearchPerformed(@Payload() event: SearchPerformedEvent, @Ctx() ctx: RmqContext) {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as ConsumeMessage;
    try {
      await this.audit.insert({
        searchId: event.searchId,
        supplier: event.supplier,
        productType: event.productType,
        criteria: event.criteria,
        travellers: event.travellers,
        status: event.status,
        cached: event.cached,
        tookMs: event.tookMs,
        offerCount: event.offerCount,
        errorCode: event.errorCode,
        performedAt: new Date(event.at),
      });
      channel.ack(msg);
    } catch (err) {
      this.logger.warn(`search audit write failed: ${(err as Error).message}`);
      retryOrDeadLetter(channel, msg, QUEUES.BOOKING_EVENTS, config.retryDelaysMs);
    }
  }
}
