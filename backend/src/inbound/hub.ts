import type { Source } from './types';
import { nessie } from './sources/nessie';
import { ledger } from './sources/ledger';
import { stripe } from './sources/stripe';

// Every input we can pull from. Adding a source = implement `Source` and list it here.
export const InboundHub = {
  sources: [nessie, stripe, ledger] as readonly Source[],

  get(name: string): Source | undefined {
    return this.sources.find(s => s.name === name);
  },

  envKeys(): string[] {
    return [...new Set(this.sources.flatMap(s => s.requiredEnv))];
  },
};
