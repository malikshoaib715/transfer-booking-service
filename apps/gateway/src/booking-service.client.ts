import {
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import { RpcResult } from '@app/contracts';

export const BOOKING_SERVICE = 'BOOKING_SERVICE';

/** Request/reply over RabbitMQ with a deadline, translated to HTTP errors. */
@Injectable()
export class BookingServiceClient {
  constructor(@Inject(BOOKING_SERVICE) private readonly client: ClientProxy) {}

  async send<T>(pattern: string, payload: unknown, timeoutMs: number): Promise<T> {
    try {
      return await firstValueFrom(this.client.send<T>(pattern, payload).pipe(timeout(timeoutMs)));
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new GatewayTimeoutException('The booking service did not reply in time');
      }
      throw new ServiceUnavailableException('The booking service is unavailable');
    }
  }

  /** Unwraps a domain result, mapping domain errors to their HTTP status. */
  async call<T>(pattern: string, payload: unknown, timeoutMs: number): Promise<T> {
    const result = await this.send<RpcResult<T>>(pattern, payload, timeoutMs);
    if (!result.ok) {
      throw new HttpException(
        {
          statusCode: result.error.httpStatus,
          error: result.error.code,
          message: result.error.message,
        },
        result.error.httpStatus,
      );
    }
    return result.data;
  }
}
