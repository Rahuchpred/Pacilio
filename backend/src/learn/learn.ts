import { SenderError, t, type InferSchema, type ProcedureCtx, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { enqueueAgentTask } from '../droid/agents';
import { logAction } from './audit';

// The pattern learner. People's decisions and corrections land in the audit
// log; a few seconds after new ones arrive, Droid reads them (no files, no
// tools) and writes or refines short patterns. Every Bookkeeper run follows
// the active patterns, and says which ones it used. People can edit, delete
// or add patterns; the learner leaves theirs alone and never brings back one
// they deleted.

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type PCtx = ProcedureCtx<InferSchema<Schema>>;
type Pattern = NonNullable<ReturnType<Ctx['db']['pattern']['id']['find']>>;
type Audit = NonNullable<ReturnType<Ctx['db']['auditLog']['id']['find']>>;
type State = NonNullable<ReturnType<Ctx['db']['patternState']['id']['find']>>;

const SECOND = 1_000_000n;
// Wait this long after the newest action, so a burst of decisions is learned together
const SETTLE_MICROS = 8n * SECOND;
// And at least this long between learning runs
const MIN_GAP_MICROS = 30n * SECOND;
const CONTEXT_ACTIONS = 40;
const MAX_PATTERNS = 12;
const MAX_TEXT = 300;
const STOPPED = ['failed', 'cancelled'];

export const patternId = (p: Pattern) => `p${p.id}`;
const auditId = (a: Audit) => `a${a.id}`;

function state(ctx: Ctx): State {
  return (
    ctx.db.patternState.id.find(0) ??
    ctx.db.patternState.insert({
      id: 0,
      learnedThrough: 0n,
      taskId: undefined,
      pendingThrough: 0n,
      lastRunAt: undefined,
      lastError: undefined,
    })
  );
}

function update(ctx: Ctx, patch: Partial<State>) {
  ctx.db.patternState.id.update({ ...state(ctx), ...patch });
}

export function activePatterns(ctx: Ctx): Pattern[] {
  return [...ctx.db.pattern.iter()].filter(p => p.status === 'active').sort((a, b) => (a.id < b.id ? -1 : 1));
}

// For the Bookkeeper's prompt
export function patternsForPrompt(ctx: Ctx): { id: string; text: string }[] {
  return activePatterns(ctx).map(p => ({ id: patternId(p), text: p.text }));
}

// The Bookkeeper's reply lists the patterns it applied
export function recordPatternUses(ctx: Ctx, used: unknown) {
  if (!Array.isArray(used)) return;
  for (const id of new Set(used.filter((u): u is string => typeof u === 'string'))) {
    const n = /^p(\d+)$/.exec(id);
    const p = n ? ctx.db.pattern.id.find(BigInt(n[1])) : undefined;
    if (p && p.status === 'active') ctx.db.pattern.id.update({ ...p, uses: p.uses + 1 });
  }
}

function clockOf(a: Audit): string {
  const d = a.at.toDate();
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function buildLearnPrompt(patterns: Pattern[], deleted: Pattern[], actions: Audit[], newFrom: bigint): string {
  const owner = (p: Pattern) => (p.source === 'learned' ? 'learned' : 'set by a person; never change or remove');
  return `You are Settle's pattern learner. Settle keeps a concert promoter's books for the Oct 24 show. Its Bookkeeper
agent sorts every money movement into a category, posts it, and asks a person about anything that looks wrong.
People then decide, or correct it. You turn what people do into short patterns the Bookkeeper follows from now on.
Work quickly: everything you need is below. Don't look for files, don't run commands, don't use tools.

## Current patterns
${patterns.length ? patterns.map(p => `- ${patternId(p)} (${owner(p)}): ${JSON.stringify(p.text)}`).join('\n') : '- none yet'}

## Patterns people deleted (never propose these or near-copies again)
${deleted.length ? deleted.map(p => `- ${JSON.stringify(p.text)}`).join('\n') : '- none'}

## What people did, oldest first (entries from ${`a${newFrom}`} on are new)
${actions.map(a => `- ${auditId(a)} · ${clockOf(a)} · ${a.whoName}: ${a.summary}${a.details !== '{}' ? ` ${a.details}` : ''}`).join('\n')}

## Your job
Find what people keep doing the same way and write it as a pattern the Bookkeeper can follow.
- One plain sentence, written as an instruction, with a clear scope (vendor, category, amount range, source):
  "Mark Mission Corner Cafe receipts under $50 as Catering and don't ask about them."
- Only from at least 2 actions that agree, unless a person stated a rule outright ("from now on ...").
- When a person overruled the Bookkeeper, learn what they chose instead, not what it suggested.
- A pattern may let the Bookkeeper email the other party itself in a kind of case ("Email Golden Gate Catering
  when a payment has no bill, asking for the bill"). Write one only when people chose Email them for that kind of
  case at least twice, or said so outright. Name who and when clearly.
- Update an existing learned pattern (same id) rather than adding a near-copy. Remove a learned pattern when newer
  actions contradict it. Never change or remove one set by a person.
- Never weaken this: money that left twice for one document still goes to a person.
  It always applies, so don't repeat it inside a pattern. Keep each pattern to the one thing it's about.
- At most ${MAX_PATTERNS} patterns in total. Returning no changes is fine.

Reply with ONLY this JSON:
{"patterns": [{"id": "p… for an update, or null for a new one", "text": "...",
   "because": "short, with counts, like 'You chose Keep on 3 of these'", "evidence": ["a…", "a…"]}],
 "remove": ["p…"]}
"patterns" lists only new or changed ones.`;
}

function applyLearned(ctx: Ctx, reply: string | undefined) {
  const raw = (reply ?? '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`Learner reply was not JSON: ${raw.slice(0, 120)}`);
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { patterns?: unknown; remove?: unknown };
  const byId = new Map([...ctx.db.pattern.iter()].map(p => [patternId(p), p]));
  const learnedOnly = (p: Pattern | undefined) => p && p.status === 'active' && p.source === 'learned';

  if (Array.isArray(parsed.remove)) {
    for (const id of parsed.remove) {
      const p = typeof id === 'string' ? byId.get(id) : undefined;
      if (learnedOnly(p)) ctx.db.pattern.id.update({ ...p!, status: 'deleted', updatedAt: ctx.timestamp });
    }
  }
  if (!Array.isArray(parsed.patterns)) return;
  for (const item of parsed.patterns as Record<string, unknown>[]) {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) continue;
    const text = item.text.trim().slice(0, MAX_TEXT);
    const because = typeof item.because === 'string' ? item.because.trim().slice(0, MAX_TEXT) : '';
    const evidence = JSON.stringify(
      Array.isArray(item.evidence)
        ? item.evidence.filter((e): e is string => typeof e === 'string' && /^a\d+$/.test(e)).slice(0, 20)
        : []
    );
    const existing = typeof item.id === 'string' ? byId.get(item.id) : undefined;
    if (existing) {
      if (learnedOnly(existing)) ctx.db.pattern.id.update({ ...existing, text, because, evidence, updatedAt: ctx.timestamp });
    } else if (activePatterns(ctx).length < MAX_PATTERNS) {
      ctx.db.pattern.insert({
        id: 0n,
        text,
        because,
        evidence,
        source: 'learned',
        status: 'active',
        uses: 0,
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
    }
  }
}

// One step of the learner, run from the pipeline tick. Returns true while
// there is learning to do, so the tick keeps running.
export function learnTick(ctx: PCtx): boolean {
  const snap = ctx.withTx(tx => {
    const s = state(tx);
    const task = s.taskId === undefined ? undefined : (tx.db.agentTask.id.find(s.taskId) ?? undefined);
    let newest: Audit | undefined;
    for (const a of tx.db.auditLog.iter()) if (a.learnable && (!newest || a.id > newest.id)) newest = a;
    return { s, task, newest };
  });

  // A learning run is out: apply it once Droid is done
  if (snap.s.taskId !== undefined) {
    const task = snap.task;
    if (!task || STOPPED.includes(task.status)) {
      ctx.withTx(tx => update(tx, { taskId: undefined, lastError: task?.error ?? 'Learning stopped' }));
      return true;
    }
    if (task.status !== 'done') return true;
    ctx.withTx(tx => {
      try {
        applyLearned(tx, task.result);
        update(tx, { taskId: undefined, learnedThrough: snap.s.pendingThrough, lastError: undefined });
      } catch (err) {
        update(tx, { taskId: undefined, lastError: err instanceof Error ? err.message : String(err) });
      }
    });
    return true;
  }

  const newest = snap.newest;
  if (!newest || newest.id <= snap.s.learnedThrough) return false;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (now - newest.at.microsSinceUnixEpoch < SETTLE_MICROS) return true;
  if (snap.s.lastRunAt && now - snap.s.lastRunAt.microsSinceUnixEpoch < MIN_GAP_MICROS) return true;

  ctx.withTx(tx => {
    const all = [...tx.db.auditLog.iter()].filter(a => a.learnable).sort((a, b) => (a.id < b.id ? -1 : 1));
    const actions = all.slice(-CONTEXT_ACTIONS);
    const firstNew = all.find(a => a.id > snap.s.learnedThrough)?.id ?? newest.id;
    const patterns = activePatterns(tx);
    const deleted = [...tx.db.pattern.iter()].filter(p => p.status === 'deleted').slice(-20);
    const taskId = enqueueAgentTask(tx, 'learn', buildLearnPrompt(patterns, deleted, actions, firstNew), 'high');
    update(tx, { taskId, pendingThrough: newest.id, lastRunAt: tx.timestamp, lastError: undefined });
  });
  return true;
}

// ─── Reducers: people own the patterns ──────────────────────────────────────

export function learn(stdb: Schema) {
  // Edit a pattern's wording. It becomes the person's, so the learner won't change it back.
  const editPattern = stdb.reducer({ patternId: t.u64(), text: t.string() }, (ctx, { patternId: id, text }) => {
    const p = ctx.db.pattern.id.find(id);
    if (!p || p.status !== 'active') throw new SenderError('Pattern not found');
    const clean = text.trim().slice(0, MAX_TEXT);
    if (!clean) throw new SenderError('Write the pattern, or delete it');
    if (clean === p.text) return;
    ctx.db.pattern.id.update({ ...p, text: clean, source: 'edited', updatedAt: ctx.timestamp });
    logAction(ctx, ctx.sender, 'pattern', `Edited a pattern: "${clean}" (was "${p.text}")`);
  });

  // Delete a pattern. It stays on record so the learner doesn't propose it again.
  const deletePattern = stdb.reducer({ patternId: t.u64() }, (ctx, { patternId: id }) => {
    const p = ctx.db.pattern.id.find(id);
    if (!p || p.status !== 'active') throw new SenderError('Pattern not found');
    ctx.db.pattern.id.update({ ...p, status: 'deleted', updatedAt: ctx.timestamp });
    logAction(ctx, ctx.sender, 'pattern', `Deleted a pattern: "${p.text}"`);
  });

  // Write a pattern yourself.
  const addPattern = stdb.reducer({ text: t.string() }, (ctx, { text }) => {
    const clean = text.trim().slice(0, MAX_TEXT);
    if (!clean) throw new SenderError('Write the pattern first');
    ctx.db.pattern.insert({
      id: 0n,
      text: clean,
      because: 'Added by a person',
      evidence: '[]',
      source: 'person',
      status: 'active',
      uses: 0,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    logAction(ctx, ctx.sender, 'pattern', `Added a pattern: "${clean}"`);
  });

  return { editPattern, deletePattern, addPattern };
}
