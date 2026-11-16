import { createHash } from 'node:crypto';

/**
 * Deterministic internal offer id: the same supplier offer always maps to the
 * same id, so cached searches and repeated searches agree.
 */
export function offerId(prefix: string, supplierRef: string): string {
  return `${prefix}_${createHash('sha256').update(supplierRef).digest('hex').slice(0, 24)}`;
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 32);
}

/** JSON.stringify with sorted object keys, so equal criteria hash equally. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
