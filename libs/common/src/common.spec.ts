import { supplierFetch } from './http';
import { toAmount } from './money';
import { offerId, stableHash } from './offer-id';

describe('toAmount', () => {
  it('normalises numbers and strings to two decimals', () => {
    expect(toAmount(24.28)).toBe('24.28');
    expect(toAmount(104)).toBe('104.00');
    expect(toAmount('45.5')).toBe('45.50');
    expect(toAmount(null)).toBe('0.00');
  });

  it('rejects non-numeric input', () => {
    expect(() => toAmount('abc')).toThrow('Invalid amount');
  });
});

describe('offerId / stableHash', () => {
  it('is deterministic and prefixed', () => {
    expect(offerId('dfl', 'off_1')).toBe(offerId('dfl', 'off_1'));
    expect(offerId('dfl', 'off_1')).toMatch(/^dfl_[a-f0-9]{24}$/);
    expect(offerId('dfl', 'off_1')).not.toBe(offerId('dfl', 'off_2'));
  });

  it('ignores key order and undefined values', () => {
    expect(stableHash({ a: 1, b: { c: [1, 2], d: undefined } })).toBe(
      stableHash({ b: { c: [1, 2] }, a: 1 }),
    );
    expect(stableHash({ a: [1, 2] })).not.toBe(stableHash({ a: [2, 1] }));
  });
});

describe('supplierFetch', () => {
  const request = {
    method: 'GET' as const,
    url: 'https://supplier.test/x',
    headers: {},
    timeoutMs: 50,
  };
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const respond = (status: number, body: string) =>
    (global.fetch = jest.fn().mockResolvedValue(new Response(body || null, { status })));

  it('returns parsed JSON on success', async () => {
    respond(200, '{"ok":1}');
    await expect(supplierFetch(request)).resolves.toEqual({ ok: true, data: { ok: 1 } });
  });

  it('returns null for an empty 204', async () => {
    respond(204, '');
    await expect(supplierFetch(request)).resolves.toEqual({ ok: true, data: null });
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
    [401, false],
    [422, false],
    [500, false],
    [502, false],
  ])('HTTP %i is retryable=%s', async (status, retryable) => {
    respond(status, '{"error":"x"}');
    const res = await supplierFetch(request);
    expect(res).toMatchObject({
      ok: false,
      error: { code: `SUPPLIER_HTTP_${status}`, retryable, httpStatus: status },
    });
  });

  it('retries a refused connection but never a timeout', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      );
    await expect(supplierFetch(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NETWORK', retryable: true },
    });

    global.fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    await expect(supplierFetch(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT', retryable: false },
    });
  });

  it('does not retry a connection that dropped mid-request', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      );
    await expect(supplierFetch(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NETWORK', retryable: false },
    });
  });
});
