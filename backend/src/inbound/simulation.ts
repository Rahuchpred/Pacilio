import type { Random } from 'spacetimedb/server';

// One promoter's world, shared by every simulated source so their records can
// be matched against each other: the vendor billed in the Ledger is the one
// paid from the Nessie bank account, the ticket buyers pay through Stripe.

export const SHOW = 'Oct 25 show';

export interface Vendor {
  name: string;
  category: string;
  item: string;
  // Typical charge range in cents
  min: number;
  max: number;
}

export const VENDORS: Vendor[] = [
  { name: 'ACME Audio Visual', category: 'audio rentals', item: 'PA system rental', min: 80_000, max: 180_000 },
  { name: 'Bay Venue Security', category: 'security', item: 'Security staff', min: 30_000, max: 65_000 },
  { name: 'Brightline Lighting Co', category: 'lighting', item: 'Lighting rig rental', min: 60_000, max: 140_000 },
  { name: 'Golden Gate Catering', category: 'catering', item: 'Artist catering', min: 25_000, max: 90_000 },
  { name: 'Pier 39 Printing', category: 'printing', item: 'Posters and wristbands', min: 8_000, max: 30_000 },
  { name: 'SF Stagehands Local 16', category: 'labor', item: 'Load-in crew', min: 90_000, max: 220_000 },
];

export const SPONSORS = [
  { name: 'Bayline Energy Drinks', item: 'Stage sponsorship', min: 250_000, max: 750_000 },
  { name: 'Mission Street Brewing', item: 'Bar sponsorship', min: 150_000, max: 400_000 },
  { name: 'Fogtown Radio', item: 'Media partnership', min: 100_000, max: 300_000 },
];

export const TICKETS = [
  { name: 'GA ticket', cents: 3_500, weight: 6 },
  { name: 'VIP package', cents: 15_000, weight: 1 },
  { name: 'Early bird ticket', cents: 2_500, weight: 2 },
];

export function pick<T>(random: Random, items: readonly T[]): T {
  return items[random.integerInRange(0, items.length - 1)];
}

export function pickWeighted<T extends { weight: number }>(random: Random, items: readonly T[]): T {
  let roll = random() * items.reduce((sum, i) => sum + i.weight, 0);
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

// A round-ish amount in [min, max] cents: invoices tend to end in whole dollars
export function amountBetween(random: Random, min: number, max: number): number {
  const dollars = random.integerInRange(Math.ceil(min / 100), Math.floor(max / 100));
  return random() < 0.7 ? dollars * 100 : dollars * 100 + random.integerInRange(1, 99);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
