import { Travellers } from '@app/contracts';

/** Hotelbeds Transfers counts paxes in three bands: infants 0-2, children 3-11, adults 12+. */
export function toPaxBands(t: Travellers): { adults: number; children: number; infants: number } {
  let adults = t.adults;
  let children = 0;
  let infants = 0;
  for (const age of t.childAges) {
    if (age <= 2) infants++;
    else if (age <= 11) children++;
    else adults++;
  }
  return { adults, children, infants };
}

/** Age used for adult paxes when a supplier wants an age per pax. */
export const DEFAULT_ADULT_AGE = 30;

export function toAges(t: Travellers): number[] {
  return [...Array<number>(t.adults).fill(DEFAULT_ADULT_AGE), ...t.childAges];
}
