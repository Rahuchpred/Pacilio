import type { InferSchema, Random, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { scenarioByKey, type Scenario } from '../scenarios';

// One business's world (see ../scenarios.ts), shared by every simulated source
// so their records can be matched against each other: the vendor billed in the
// Ledger is the one paid from the Nessie bank account, the customers paying by
// card go through Stripe.

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// The business the simulation plays now; the concert until someone switches.
export function activeScenario(tx: { db: Ctx['db'] }): Scenario {
  return scenarioByKey(tx.db.scenario.id.find(0)?.key);
}

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
