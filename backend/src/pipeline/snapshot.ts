import type { InferSchema, ProcedureCtx, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { FactoryClient } from '../droid/factory';
import { activeScenario } from '../inbound/simulation';

// The backend owns the ledger. The Bookkeeper used to append its rows to
// ledger.json on the Factory computer and re-read the whole file every run,
// which got slower as the ledger grew. Now every checked row lives in these
// tables, and a snapshot of them is uploaded to a fresh folder before an agent
// needs it. The Bookkeeper only searches it (Grep) and replies; Pacioli writes
// the rows from its reply.

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type PCtx = ProcedureCtx<InferSchema<Schema>>;
type Files = NonNullable<ReturnType<Ctx['db']['ledgerFiles']['id']['find']>>;

export const HOME = '/home/factory-user';
const DATA = 'settle/data';

type Item = NonNullable<ReturnType<Ctx['db']['reviewItem']['id']['find']>>;

// Statuses as the ledger (and the workbook tool) know them
function statusOf(item: Item | undefined, outcome: string | undefined): { status: string; recommendation: string | null } {
  if (outcome === 'ok') return { status: 'ok', recommendation: null };
  if (outcome === 'void') return { status: 'void', recommendation: null };
  if (!item || item.status === 'open') return { status: 'review', recommendation: item?.recommendation ?? null };
  switch (item.decision) {
    case 'void':
      return { status: 'void', recommendation: null };
    case 'refund':
      return { status: 'refunded', recommendation: null };
    case 'follow_up':
      return { status: 'following_up', recommendation: null };
    default:
      return { status: 'ok', recommendation: null };
  }
}

export interface LedgerRow {
  row: number;
  event_id: string;
  date: string;
  source: string;
  kind: string;
  counterparty: string;
  description: string;
  reference: string | null;
  category: string;
  amount_cents: number;
  currency: string;
  status: string;
  note: string;
  duplicate_of: string | null;
  recommendation: string | null;
}

// Every checked event as a ledger row, numbered in arrival order (the same
// numbers the board's spreadsheet shows).
export function ledgerRows(ctx: Ctx): LedgerRow[] {
  const done = [...ctx.db.eventReview.iter()].filter(r => r.status === 'done').sort((a, b) => (a.eventId < b.eventId ? -1 : 1));
  // The newest question per event, and any duplicate it pointed at
  const latest = new Map<bigint, Item>();
  const dupOf = new Map<bigint, bigint>();
  for (const i of ctx.db.reviewItem.iter()) {
    const prev = latest.get(i.eventId);
    if (!prev || i.id > prev.id) latest.set(i.eventId, i);
    if (i.duplicateOf !== undefined) dupOf.set(i.eventId, i.duplicateOf);
  }
  const rows: LedgerRow[] = [];
  done.forEach((r, i) => {
    const e = ctx.db.inboundEvent.id.find(r.eventId);
    if (!e) return;
    const { status, recommendation } = statusOf(latest.get(e.id), r.outcome);
    const dup = dupOf.get(e.id);
    rows.push({
      row: i + 1,
      event_id: e.id.toString(),
      date: e.occurredAt.toDate().toISOString().slice(0, 10),
      source: e.source,
      // "bill" / "invoice" are QuickBooks documents (who owes whom), not money moving
      kind: e.kind,
      counterparty: e.counterparty,
      description: e.description,
      reference: e.reference ?? null,
      category: r.category ?? '',
      amount_cents: Number(e.amountMinor),
      currency: e.currency,
      status,
      note: r.note ?? '',
      duplicate_of: dup !== undefined ? dup.toString() : null,
      recommendation,
    });
  });
  return rows;
}

// The ledger as JSON, one row per line, so it greps well. "scenario" names
// the business for the report tool's titles.
export function buildLedgerJson(ctx: Ctx): { json: string; rows: number } {
  const lines = ledgerRows(ctx).map(r => JSON.stringify(r));
  const { report, sales } = activeScenario(ctx);
  const scenario = JSON.stringify({ report, sales: { title: sales.title, chart: sales.chart, unit: sales.unit } });
  // ASCII only (\uXXXX escapes): the upload declares its size in characters
  const body = `{"scenario": ${scenario},\n"rows": [\n${lines.join(',\n')}\n]}\n`.replace(
    /[\u0080-￿]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  return { json: body, rows: lines.length };
}

function files(ctx: Ctx): Files | undefined {
  return ctx.db.ledgerFiles.id.find(0) ?? undefined;
}

function saveFiles(ctx: Ctx, patch: Partial<Files>) {
  const prev = files(ctx);
  const row: Files = {
    id: 0,
    seq: 0n,
    latestDir: '',
    rows: 0,
    writtenAt: ctx.timestamp,
    renderDir: undefined,
    reportDir: undefined,
    uploadSessionId: undefined,
    ...prev,
    ...patch,
  };
  if (prev) ctx.db.ledgerFiles.id.update(row);
  else ctx.db.ledgerFiles.insert(row);
}

// Write a fresh snapshot of the ledger to the Factory computer and return its
// folder (absolute). Reuses one upload session; makes a new one if it fails.
export function uploadSnapshot(ctx: PCtx): string {
  const { json, rows, seq, sessionId } = ctx.withTx(tx => {
    const built = buildLedgerJson(tx);
    const f = files(tx);
    return { ...built, seq: (f?.seq ?? 0n) + 1n, sessionId: f?.uploadSessionId };
  });
  const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
  const computerId = ctx.env.FACTORY_COMPUTER_ID;
  const dest = `${DATA}/${seq}/ledger.json`;
  let session = sessionId;
  try {
    if (!session) throw new Error('no upload session yet');
    factory.uploadTextFile(computerId, session, dest, json);
  } catch {
    factory.wakeComputer(computerId);
    session = factory.createSession(computerId, { autonomyLevel: 'off' });
    factory.uploadTextFile(computerId, session, dest, json);
  }
  const dir = `${HOME}/${DATA}/${seq}`;
  ctx.withTx(tx => saveFiles(tx, { seq, latestDir: dir, rows, writtenAt: tx.timestamp, uploadSessionId: session }));
  return dir;
}

export function setRenderDir(ctx: Ctx, dir: string) {
  saveFiles(ctx, { renderDir: dir });
}

export function setReportDir(ctx: Ctx, dir: string) {
  saveFiles(ctx, { reportDir: dir });
}

export function latestFiles(ctx: Ctx): Files | undefined {
  return files(ctx);
}

// "settle/data/12/ledger.xlsx" from "/home/factory-user/settle/data/12"
export function relative(dir: string, file: string): string {
  return `${dir.replace(`${HOME}/`, '')}/${file}`;
}
