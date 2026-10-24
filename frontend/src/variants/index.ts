import type { Variant } from './types';

// Every folder in variants/ with an index.tsx that default-exports a Variant
// shows up in the dock, sorted by `order`. No list to edit by hand.
const found = import.meta.glob<{ default: Variant }>('./*/index.tsx', { eager: true });

export const variants: Variant[] = Object.values(found)
  .map(m => m.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
