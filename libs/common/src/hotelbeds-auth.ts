import { createHash } from 'node:crypto';

/**
 * Hotelbeds APItude request signing: X-Signature is the hex SHA-256 of
 * apiKey + secret + current Unix time in seconds, concatenated with no
 * separator. The same scheme applies to every APItude suite.
 */
export function hotelbedsSignature(apiKey: string, secret: string, nowMs = Date.now()): string {
  const seconds = Math.floor(nowMs / 1000);
  return createHash('sha256').update(`${apiKey}${secret}${seconds}`).digest('hex');
}

export function hotelbedsHeaders(apiKey: string, secret: string, nowMs = Date.now()) {
  return {
    'Api-key': apiKey,
    'X-Signature': hotelbedsSignature(apiKey, secret, nowMs),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/** Hotelbeds error bodies vary by suite; pull out whatever message is present. */
export function describeHotelbedsError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.error === 'string') return `HTTP ${status}: ${b.error}`;
    const errors = Array.isArray(b.errors) ? (b.errors as Record<string, unknown>[]) : [];
    if (errors.length) {
      return `HTTP ${status}: ${errors.map((e) => `${String(e.code ?? '')} ${String(e.text ?? e.message ?? '')}`.trim()).join('; ')}`;
    }
    if (b.code || b.message)
      return `HTTP ${status}: ${String(b.code ?? '')} ${String(b.message ?? '')}`.trim();
  }
  const snippet = typeof body === 'string' ? body : JSON.stringify(body);
  return `HTTP ${status}: ${(snippet ?? '').slice(0, 300)}`;
}
