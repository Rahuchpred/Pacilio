import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { logAction } from '../learn/audit';

// Classification settings: the category list and auto/manual mode, shared by
// everyone and read by the Bookkeeper's prompt on every run.

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;

export const DEFAULT_CATEGORIES = [
  'Revenue · Tickets',
  'Revenue · Sponsorship',
  'Production · Audio & lighting',
  'Security',
  'Catering',
  'Labor & payroll',
  'Marketing & printing',
  'Permits & fees',
  'Processor fees & refunds',
  'Cash & transfers',
  'Other',
];
const MAX_CATEGORIES = 40;
const MAX_NAME = 60;

export type Classifying = { mode: 'auto' | 'manual'; categories: string[] };

function writeList(ctx: Ctx, names: string[]) {
  for (const row of [...ctx.db.classification.iter()]) ctx.db.classification.name.delete(row.name);
  names.forEach((name, position) => ctx.db.classification.insert({ name, position }));
}

function setMode(ctx: Ctx, mode: 'auto' | 'manual') {
  if (ctx.db.classificationMode.id.find(0)) ctx.db.classificationMode.id.update({ id: 0, mode });
  else ctx.db.classificationMode.insert({ id: 0, mode });
}

// Seed the defaults once, so the settings have something to show.
export function ensureClassificationDefaults(ctx: Ctx) {
  if (ctx.db.classification.count() === 0n) writeList(ctx, DEFAULT_CATEGORIES);
  if (!ctx.db.classificationMode.id.find(0)) setMode(ctx, 'auto');
}

// What the Bookkeeper's next run uses.
export function currentClassifying(ctx: Ctx): Classifying {
  const rows = [...ctx.db.classification.iter()].sort((a, b) => a.position - b.position).map(r => r.name);
  const mode = ctx.db.classificationMode.id.find(0)?.mode === 'manual' ? 'manual' : 'auto';
  return { mode, categories: rows.length ? rows : DEFAULT_CATEGORIES };
}

// Categories the agent has actually used, so switching to manual starts from
// what's in the ledger, not just the defaults.
function inUse(ctx: Ctx): string[] {
  const seen = new Set<string>();
  for (const r of ctx.db.eventReview.iter()) if (r.category) seen.add(r.category);
  return [...seen];
}

export function classify(stdb: Schema) {
  // Auto: the agent may add categories. Manual: only the list. Switching to
  // manual adds any categories the agent invented to the list first.
  const setClassificationMode = stdb.reducer({ mode: t.string() }, (ctx, { mode }) => {
    if (mode !== 'auto' && mode !== 'manual') throw new SenderError('Mode must be auto or manual');
    if (mode === 'manual') {
      const list = currentClassifying(ctx).categories;
      const extra = inUse(ctx).filter(c => !list.includes(c));
      if (extra.length) writeList(ctx, [...list, ...extra].slice(0, MAX_CATEGORIES));
    }
    setMode(ctx, mode);
    logAction(ctx, ctx.sender, 'classification', `Switched classifications to ${mode === 'auto' ? 'Auto' : 'Manual'}`, { learnable: true });
  });

  // The edited list (manual mode). Rows already in the ledger keep their category.
  const setClassifications = stdb.reducer({ names: t.array(t.string()) }, (ctx, { names }) => {
    const clean: string[] = [];
    for (const raw of names) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      if (name.length > MAX_NAME) throw new SenderError(`"${name.slice(0, 20)}…" is too long`);
      if (!clean.some(c => c.toLowerCase() === name.toLowerCase())) clean.push(name);
    }
    if (!clean.length) throw new SenderError('Keep at least one category');
    if (clean.length > MAX_CATEGORIES) throw new SenderError(`At most ${MAX_CATEGORIES} categories`);
    const before = currentClassifying(ctx).categories;
    writeList(ctx, clean);
    const added = clean.filter(c => !before.includes(c));
    const removed = before.filter(c => !clean.includes(c));
    const what = [added.length ? `added ${added.join(', ')}` : '', removed.length ? `removed ${removed.join(', ')}` : '']
      .filter(Boolean)
      .join('; ');
    logAction(ctx, ctx.sender, 'classification', `Edited the categories${what ? `: ${what}` : ''}`, {
      learnable: true,
      details: { added, removed },
    });
  });

  const resetClassifications = stdb.reducer(ctx => {
    writeList(ctx, DEFAULT_CATEGORIES);
    setMode(ctx, 'auto');
    logAction(ctx, ctx.sender, 'classification', 'Reset the categories to the default list (Auto)', { learnable: true });
  });

  return { setClassificationMode, setClassifications, resetClassifications };
}
