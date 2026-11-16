import { SupplierError } from '@app/contracts';

export interface SupplierHttpRequest {
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
}

export type SupplierHttpResult<T> = { ok: true; data: T } | { ok: false; error: SupplierError };

/** Statuses where the supplier states it did not process the request. */
const SAFE_TO_RETRY_STATUSES = new Set([429, 503]);

/**
 * Thin fetch wrapper shared by the supplier adapters. It never throws:
 * transport failures and non-2xx responses come back as a SupplierError with
 * an explicit `retryable` flag.
 */
export async function supplierFetch<T>(
  req: SupplierHttpRequest,
  describeError: (status: number, body: unknown) => string = defaultDescribe,
): Promise<SupplierHttpResult<T>> {
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(req.timeoutMs),
    });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return {
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: `No response within ${req.timeoutMs}ms`,
          retryable: false,
        },
      };
    }
    const causeCode = e.cause?.code ?? '';
    // The connection was never established, so the supplier saw nothing.
    const neverSent = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(causeCode);
    return {
      ok: false,
      error: {
        code: 'NETWORK',
        message: `${e.message}${causeCode ? ` (${causeCode})` : ''}`,
        retryable: neverSent,
      },
    };
  }

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error page; keep the raw text.
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        code: `SUPPLIER_HTTP_${res.status}`,
        message: describeError(res.status, body),
        retryable: SAFE_TO_RETRY_STATUSES.has(res.status),
        httpStatus: res.status,
      },
    };
  }
  return { ok: true, data: body as T };
}

function defaultDescribe(status: number, body: unknown): string {
  const snippet = typeof body === 'string' ? body : JSON.stringify(body);
  return `HTTP ${status}: ${(snippet ?? '').slice(0, 300)}`;
}

export const NOT_CONFIGURED = (what: string): SupplierError => ({
  code: 'NOT_CONFIGURED',
  message: `${what} is not set. Add your sandbox credentials to .env.`,
  retryable: false,
});
