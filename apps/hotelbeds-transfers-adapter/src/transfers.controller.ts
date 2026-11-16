import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  RPC,
  SupplierBookRequest,
  SupplierBookResult,
  SupplierSearchRequest,
  SupplierSearchResult,
} from '@app/contracts';
import { TransfersClient } from './transfers.client';

@Controller()
export class TransfersController {
  constructor(private readonly transfers: TransfersClient) {}

  @MessagePattern(RPC.SUPPLIER_SEARCH)
  search(@Payload() req: SupplierSearchRequest): Promise<SupplierSearchResult> {
    return this.transfers.search(req.criteria, req.travellers);
  }

  @MessagePattern(RPC.SUPPLIER_BOOK)
  book(@Payload() req: SupplierBookRequest): Promise<SupplierBookResult> {
    return this.transfers.book(req);
  }
}
