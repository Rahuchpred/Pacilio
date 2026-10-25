// Before each Bookkeeper run, Pacioli finds the rows each new event should be
// compared with, so the agent neither reads the whole ledger (slow) nor guesses
// Grep patterns (misses typos and wrong prices). Plain functions over plain
// rows, so they run (and are tested) without the database.

export interface MatchRow {
  row: number;
  event_id: string;
  source: string;
  amount_cents: number;
  counterparty: string;
  description: string;
  reference: string | null;
}

// A QuickBooks bill or invoice, with what is still open and which rows paid it
export interface MatchDoc {
  doc: string;
  kind: 'bill' | 'invoice';
  party: string;
  total_cents: number;
  open_cents: number;
  status: string;
  paid_by_rows: number[];
}

// Most related rows listed per event
export const MAX_RELATED = 6;
// An equal amount alone links two rows only above this (ticket prices repeat)
const EXACT_AMOUNT_MIN = 50_000;

// Bill and invoice numbers, like "AAV-1042" or "INV-2290"
const DOC_NUMBER = /\b[A-Z]{2,5}-\d{3,6}\b/gi;

export function docNumbersIn(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) for (const m of (text ?? '').matchAll(DOC_NUMBER)) found.add(m[0].toUpperCase());
  return [...found];
}

const SUFFIXES = new Set(['inc', 'co', 'llc', 'ltd', 'corp', 'company', 'the']);

// "ACME Audio-Visual, Inc." → "acme audio visual"
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !SUFFIXES.has(w))
    .join(' ');
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// The same party despite typos, casing, abbreviations or a dropped word
export function similarNames(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  if (short.length >= 5 && long.includes(short)) return true;
  return editDistance(a, b) <= Math.max(1, Math.floor(long.length * 0.2));
}

// Rows related to each new event: other rows (already in the ledger, or new
// in this run) that share a document number, a similar name or a close amount.
export function findRelated(events: MatchRow[], ledger: MatchRow[], max = MAX_RELATED): Map<string, number[]> {
  const pool = [...ledger, ...events];
  const docs = new Map(pool.map(r => [r.event_id, docNumbersIn(r.description, r.reference)]));
  const names = new Map(pool.map(r => [r.event_id, normalizeName(r.counterparty)]));
  // Names repeat a lot (vendors, payouts), so compare each pair once
  const pairs = new Map<string, boolean>();
  const similar = (a: string, b: string) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let same = pairs.get(key);
    if (same === undefined) pairs.set(key, (same = similarNames(a, b)));
    return same;
  };

  const out = new Map<string, number[]>();
  for (const e of events) {
    const eDocs = docs.get(e.event_id) ?? [];
    const eName = names.get(e.event_id) ?? '';
    const eAmount = Math.abs(e.amount_cents);
    const scored: { row: number; score: number; gap: number }[] = [];
    for (const r of pool) {
      if (r.event_id === e.event_id) continue;
      const rAmount = Math.abs(r.amount_cents);
      const gap = Math.abs(rAmount - eAmount) / Math.max(rAmount, eAmount, 1);
      const sameDoc = eDocs.some(d => docs.get(r.event_id)?.includes(d));
      const sameName = similar(eName, names.get(r.event_id) ?? '');
      let score = 0;
      if (sameDoc) score += 10;
      if (sameName) score += 4;
      if (rAmount === eAmount && eAmount >= EXACT_AMOUNT_MIN) score += 4;
      else if (sameName && gap <= 0.1) score += 2;
      if (score >= 4) scored.push({ row: r.row, score, gap });
    }
    scored.sort((a, b) => b.score - a.score || a.gap - b.gap || b.row - a.row);
    out.set(e.event_id, scored.slice(0, max).map(s => s.row).sort((a, b) => a - b));
  }
  return out;
}

// The QuickBooks documents each new event's memo or reference names
export function docsFor(events: MatchRow[], docs: MatchDoc[]): Map<string, string[]> {
  const known = new Set(docs.map(d => d.doc.toUpperCase()));
  return new Map(events.map(e => [e.event_id, docNumbersIn(e.description, e.reference).filter(d => known.has(d))]));
}

// How many QuickBooks bills we have from each new event's counterparty (typos
// allowed): a vendor we have bills from is one we already work with
export function vendorBillCounts(events: MatchRow[], docs: MatchDoc[]): Map<string, number> {
  const parties = docs.filter(d => d.kind === 'bill').map(d => normalizeName(d.party));
  return new Map(events.map(e => {
    const name = normalizeName(e.counterparty);
    return [e.event_id, parties.filter(p => similarNames(p, name)).length];
  }));
}
