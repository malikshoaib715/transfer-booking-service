/** Normalise supplier amounts (number or numeric string) to a 2dp decimal string. */
export function toAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0.00';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${String(value)}`);
  return n.toFixed(2);
}
