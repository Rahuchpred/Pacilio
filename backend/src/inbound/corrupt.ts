// TypeScript rebuilds of two Python libraries, sized for this project:
// - mistaker: human data-entry errors on text (typos, casing, abbreviations)
// - gecko-syndata: near-duplicate records with a few controlled differences
// Randomness comes from SpacetimeDB's seeded `ctx.random`, so runs repeat.

import type { Random } from 'spacetimedb/server';
import type { Corruption, CorruptionProfile, InboundEventDraft } from './types';

// ─── mistaker-style text errors ─────────────────────────────────────────────

const QWERTY_NEIGHBORS: Record<string, string> = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok',
  o: 'ipl', p: 'ol', a: 'qsz', s: 'awdz', d: 'sefx', f: 'drgc', g: 'fthv',
  h: 'gyjb', j: 'hukn', k: 'jilm', l: 'kop', z: 'asx', x: 'zsdc', c: 'xdfv',
  v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
  '1': '2q', '2': '13w', '3': '24e', '4': '35r', '5': '46t', '6': '57y',
  '7': '68u', '8': '79i', '9': '80o', '0': '9p',
};

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bIncorporated\b/i, 'Inc'],
  [/\bInc\.?(?=\s|$)/i, 'INC'],
  [/\bCompany\b/i, 'Co'],
  [/\bLimited\b/i, 'Ltd'],
  [/\bCorporation\b/i, 'Corp'],
  [/\bServices\b/i, 'Svcs'],
  [/\band\b/i, '&'],
];

function pick<T>(random: Random, items: readonly T[]): T {
  return items[random.integerInRange(0, items.length - 1)];
}

// Index of a random letter or digit, or -1 if there is none.
function randomAlnumIndex(random: Random, s: string): number {
  const indexes = [...s].flatMap((ch, i) => (/[a-z0-9]/i.test(ch) ? [i] : []));
  return indexes.length ? pick(random, indexes) : -1;
}

type TextOp = (random: Random, s: string) => string | undefined;

const TEXT_OPS: Record<string, TextOp> = {
  // Hit the key next to the intended one
  adjacent_key(random, s) {
    const i = randomAlnumIndex(random, s);
    const neighbors = i >= 0 ? QWERTY_NEIGHBORS[s[i].toLowerCase()] : undefined;
    if (!neighbors) return undefined;
    const ch = pick(random, [...neighbors]);
    const cased = s[i] === s[i].toUpperCase() ? ch.toUpperCase() : ch;
    return s.slice(0, i) + cased + s.slice(i + 1);
  },
  // Swap two neighboring characters
  transpose(random, s) {
    if (s.length < 2) return undefined;
    const i = random.integerInRange(0, s.length - 2);
    if (s[i] === s[i + 1]) return undefined;
    return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
  },
  // Skip a character
  drop(random, s) {
    const i = randomAlnumIndex(random, s);
    return i >= 0 && s.length > 3 ? s.slice(0, i) + s.slice(i + 1) : undefined;
  },
  // Press a key twice
  double(random, s) {
    const i = randomAlnumIndex(random, s);
    return i >= 0 ? s.slice(0, i + 1) + s[i] + s.slice(i + 1) : undefined;
  },
  // Caps lock, or someone who types everything lowercase
  casing(random, s) {
    const next = random() < 0.5 ? s.toUpperCase() : s.toLowerCase();
    return next === s ? undefined : next;
  },
  // Inconsistent legal suffixes and shorthand
  abbreviate(random, s) {
    const matches = ABBREVIATIONS.filter(([re]) => re.test(s));
    if (!matches.length) return undefined;
    const [re, short] = pick(random, matches);
    return s.replace(re, short);
  },
  // Stray punctuation and spacing
  punctuation(random, s) {
    const stripped = s.replace(/[.,]/g, '');
    if (stripped !== s && random() < 0.5) return stripped;
    const i = s.indexOf(' ');
    return i > 0 ? s.slice(0, i) + '  ' + s.slice(i + 1) : undefined;
  },
};

const TEXT_OP_NAMES = Object.keys(TEXT_OPS);

// Apply one random data-entry error. Tries a few ops before giving up.
export function typo(random: Random, value: string): { value: string; op: string } | undefined {
  for (let attempt = 0; attempt < 4; attempt++) {
    const op = pick(random, TEXT_OP_NAMES);
    const next = TEXT_OPS[op](random, value);
    if (next !== undefined && next !== value) return { value: next, op };
  }
  return undefined;
}

// ─── gecko-style near-duplicates ────────────────────────────────────────────

const DAY_MS = 86_400_000;

type DuplicateOp = (
  random: Random,
  draft: InboundEventDraft,
  profile: CorruptionProfile
) => Corruption | undefined;

const DUPLICATE_OPS: Record<string, DuplicateOp> = {
  // Re-keyed by hand with a slip in a text field
  retyped(random, draft, profile) {
    const field = pick(random, profile.typoFields.length ? profile.typoFields : ['description'] as const);
    const before = draft[field] ?? '';
    const result = typo(random, before);
    if (!result) return undefined;
    draft[field] = result.value;
    return { field, op: `retyped:${result.op}`, before, after: result.value };
  },
  // Entered or settled a day or two apart
  date_shift(random, draft) {
    const days = pick(random, [-2, -1, 1, 2]);
    const before = draft.occurredAt.toISOString();
    draft.occurredAt = new Date(draft.occurredAt.getTime() + days * DAY_MS);
    return { field: 'occurredAt', op: 'date_shift', before, after: draft.occurredAt.toISOString() };
  },
  // Rounded to whole units when re-entered
  amount_rounded(_random, draft) {
    const before = draft.amountMinor;
    const after = (before / 100n) * 100n;
    if (after === before) return undefined;
    draft.amountMinor = after;
    return { field: 'amountMinor', op: 'amount_rounded', before: String(before), after: String(after) };
  },
  // Slightly different amount: a fee, tip or tax applied on one copy only
  amount_nudged(random, draft) {
    const before = draft.amountMinor;
    const pct = BigInt(random.integerInRange(1, 5));
    const delta = (before * pct) / 100n || 1n;
    draft.amountMinor = before + (random() < 0.7 ? delta : -delta);
    return { field: 'amountMinor', op: `amount_nudged:${pct}%`, before: String(before), after: String(draft.amountMinor) };
  },
};

const DUPLICATE_OP_NAMES = Object.keys(DUPLICATE_OPS);

// A second copy of `original` with 1–2 small differences.
export function nearDuplicate(
  random: Random,
  original: InboundEventDraft,
  profile: CorruptionProfile
): { draft: InboundEventDraft; corruptions: Corruption[] } {
  const draft: InboundEventDraft = { ...original, occurredAt: new Date(original.occurredAt) };
  const corruptions: Corruption[] = [];
  const wanted = random.integerInRange(1, 2);
  const ops = random.shuffle([...DUPLICATE_OP_NAMES]);
  for (const op of ops) {
    if (corruptions.length >= wanted) break;
    const change = DUPLICATE_OPS[op](random, draft, profile);
    if (change) corruptions.push(change);
  }
  return { draft, corruptions };
}

// ─── Applying a profile ─────────────────────────────────────────────────────

export interface CorruptedEvent {
  draft: InboundEventDraft;
  corruptions: Corruption[];
  // Index into the returned list of the event this one duplicates
  duplicateOfIndex?: number;
}

export function corrupt(
  random: Random,
  drafts: InboundEventDraft[],
  profile: CorruptionProfile
): CorruptedEvent[] {
  const out: CorruptedEvent[] = [];
  for (const original of drafts) {
    const draft = { ...original };
    const corruptions: Corruption[] = [];
    if (random() < profile.typoRate && profile.typoFields.length) {
      const field = pick(random, profile.typoFields);
      const before = draft[field] ?? '';
      const result = typo(random, before);
      if (result) {
        draft[field] = result.value;
        corruptions.push({ field, op: result.op, before, after: result.value });
      }
    }
    out.push({ draft, corruptions });

    if (random() < profile.duplicateRate) {
      const dup = nearDuplicate(random, draft, profile);
      out.push({
        draft: { ...dup.draft, sourceId: `${draft.sourceId}~dup` },
        corruptions: dup.corruptions,
        duplicateOfIndex: out.length - 1,
      });
    }
  }
  return out;
}
