import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { rowState, type Row } from './live';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { scenarioByKey } from '../../../backend/src/scenarios';
import type {
  AgentRun,
  AgentStep,
  EmailMessage,
  EmailThread,
  InboundEvent,
  ReviewDetail,
  ReviewItem,
} from '../module_bindings/types';

// One copy of the live tables for the whole app. useTable opens its own server
// subscription and copies its table on every change, so each table is read
// here exactly once, and the joins (every event with its review and question)
// are worked out once per change instead of in every card.

type Rows<T> = readonly T[];

// A QuickBooks bill (we owe) or invoice (owed to us), joined to the event that brought it in
export type Doc = {
  kind: 'bill' | 'invoice';
  id: bigint;
  party: string;
  docNumber: string;
  totalMinor: bigint;
  balanceMinor: bigint;
  currency: string;
  txnDate: import('spacetimedb').Timestamp;
  dueDate: import('spacetimedb').Timestamp;
  status: string;
  eventId: bigint | undefined;
};

const byId = <T extends { id: bigint }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function useLiveTables() {
  const [events, eventsReady] = useTable(tables.inboundEvent);
  const [reviews] = useTable(tables.eventReview);
  const [items] = useTable(tables.reviewItem);
  const [details] = useTable(tables.reviewDetail);
  const [runs] = useTable(tables.agentRun);
  const [steps] = useTable(tables.agentStep);
  const [agents] = useTable(tables.pipelineAgent);
  const [statuses] = useTable(tables.inboundSourceStatus);
  const [threads] = useTable(tables.emailThread);
  const [messages] = useTable(tables.emailMessage);
  const [followUps, followUpsReady] = useTable(tables.emailFollowUp);
  const [ledgerDocs] = useTable(tables.ledgerDocument);
  const [reportStates] = useTable(tables.reportState);
  const [reportDocs] = useTable(tables.reportDocument);
  const [agentMessages] = useTable(tables.agentMessage);
  const [reportCharts] = useTable(tables.reportChart);
  const [classifications] = useTable(tables.classification);
  const [auditLog] = useTable(tables.auditLog);
  const [ledgerRenders] = useTable(tables.ledgerRender);
  const [ledgerFiles] = useTable(tables.ledgerFiles);
  const [bills] = useTable(tables.accountingBill);
  const [invoices] = useTable(tables.accountingInvoice);
  const [payments] = useTable(tables.accountingPayment);
  const [patterns] = useTable(tables.pattern);
  const [patternStates] = useTable(tables.patternState);
  const [classificationModes] = useTable(tables.classificationMode);
  const [scenarioRows] = useTable(tables.scenario);
  return {
    scenarioRows,
    bills,
    invoices,
    payments,
    ledgerFiles,
    ledgerRenders,
    auditLog,
    patterns,
    patternStates,
    classifications,
    classificationModes,
    reportCharts,
    agentMessages,
    events,
    eventsReady,
    reviews,
    items,
    details,
    runs,
    steps,
    agents,
    statuses,
    threads,
    messages,
    followUps,
    followUpsReady,
    ledgerDocs,
    reportStates,
    reportDocs,
  };
}

function index<T, K>(rows: Rows<T>, key: (r: T) => K): Map<K, T> {
  return new Map(rows.map(r => [key(r), r]));
}

function group<T>(rows: Rows<T>, key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

function useDerived(t: ReturnType<typeof useLiveTables>) {
  const eventsSorted = useMemo(() => [...t.events].sort(byId), [t.events]);
  const eventBy = useMemo(() => index<InboundEvent, string>(t.events, e => e.id.toString()), [t.events]);
  const reviewBy = useMemo(() => index(t.reviews, r => r.eventId.toString()), [t.reviews]);
  // The newest question for each event decides its state
  const itemBy = useMemo(() => {
    const m = new Map<string, ReviewItem>();
    for (const i of [...t.items].sort(byId)) m.set(i.eventId.toString(), i);
    return m;
  }, [t.items]);
  const itemsByEvent = useMemo(() => group([...t.items].sort(byId), i => i.eventId.toString()), [t.items]);
  // Every event with its review, its question and where it stands, oldest first
  const rows = useMemo<Row[]>(
    () =>
      eventsSorted.map(event => {
        const id = event.id.toString();
        const review = reviewBy.get(id);
        const item = itemBy.get(id);
        return { event, review, item, state: rowState(review, item) };
      }),
    [eventsSorted, reviewBy, itemBy]
  );
  const rowBy = useMemo(() => new Map(rows.map(r => [r.event.id.toString(), r])), [rows]);
  const openItems = useMemo(() => t.items.filter(i => i.status === 'open').sort(byId), [t.items]);
  const detailBy = useMemo(() => index<ReviewDetail, string>(t.details, d => d.itemId.toString()), [t.details]);
  const runsDesc = useMemo(() => [...t.runs].sort((a, b) => byId(b, a)) as AgentRun[], [t.runs]);
  const stepsByTask = useMemo(() => {
    const m = group<AgentStep>(t.steps, s => s.taskId.toString());
    for (const list of m.values()) list.sort((a, b) => (a.seq < b.seq ? -1 : 1));
    return m;
  }, [t.steps]);
  const threadsSorted = useMemo(
    () =>
      [...t.threads].sort((a, b) => {
        if (a.unread !== b.unread) return a.unread ? -1 : 1;
        return b.lastActivityAt.microsSinceUnixEpoch > a.lastActivityAt.microsSinceUnixEpoch ? 1 : -1;
      }) as EmailThread[],
    [t.threads]
  );
  const messagesByThread = useMemo(() => {
    const m = group<EmailMessage>(t.messages, x => x.threadId.toString());
    for (const list of m.values()) list.sort((a, b) => (a.sentAt.microsSinceUnixEpoch < b.sentAt.microsSinceUnixEpoch ? -1 : 1));
    return m;
  }, [t.messages]);
  // Messages Ask Pacioli sent, by the ask that sent them (oldest first)
  const messagesByAsk = useMemo(
    () => group([...t.agentMessages].sort(byId), m => m.askTaskId.toString()),
    [t.agentMessages]
  );
  const followUpSteps = useMemo(
    () => [...t.followUps].sort((a, b) => a.step - b.step).map(r => ({ delayMin: r.delayMin, message: r.message })),
    [t.followUps]
  );
  // QuickBooks: each bill or invoice by the event that brought it in, and
  // which bank row paid what (payments carry "event:<id>" as their reference)
  const docByEvent = useMemo(() => {
    const m = new Map<string, Doc>();
    const byKey = new Map<string, Doc>();
    for (const b of t.bills) byKey.set(`bill:${b.id}`, { kind: 'bill', id: b.id, party: b.vendor, docNumber: b.docNumber, totalMinor: b.totalMinor, balanceMinor: b.balanceMinor, currency: b.currency, txnDate: b.txnDate, dueDate: b.dueDate, status: b.status, eventId: undefined });
    for (const i of t.invoices) byKey.set(`invoice:${i.id}`, { kind: 'invoice', id: i.id, party: i.customer, docNumber: i.docNumber, totalMinor: i.totalMinor, balanceMinor: i.balanceMinor, currency: i.currency, txnDate: i.txnDate, dueDate: i.dueDate, status: i.status, eventId: undefined });
    for (const e of t.events) {
      if (e.source !== 'ledger') continue;
      const d = byKey.get(e.sourceId);
      if (!d) continue;
      // The first event for a document is the real one; later ones are copies
      if (!d.eventId || e.id < d.eventId) d.eventId = e.id;
      m.set(e.id.toString(), d);
    }
    return m;
  }, [t.bills, t.invoices, t.events]);
  const docs = useMemo(() => [...new Set(docByEvent.values())], [docByEvent]);
  const paymentsByDoc = useMemo(() => group([...t.payments].sort(byId), p => `${p.docType}:${p.docId}`), [t.payments]);
  const paidByEvent = useMemo(() => {
    const m = new Map<string, { kind: string; docId: bigint; amountMinor: bigint }>();
    for (const p of t.payments) {
      const id = p.reference.startsWith('event:') ? p.reference.slice(6) : '';
      if (id) m.set(id, { kind: p.docType, docId: p.docId, amountMinor: p.amountMinor });
    }
    return m;
  }, [t.payments]);
  // Each checked row's number in the ledger (arrival order), and counts by state
  const rowNumberBy = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const r of rows) if (r.state !== 'waiting' && r.state !== 'checking') m.set(r.event.id.toString(), ++n);
    return m;
  }, [rows]);
  const stateCounts = useMemo(() => {
    let checking = 0;
    let waiting = 0;
    for (const r of rows) {
      if (r.state === 'checking') checking++;
      else if (r.state === 'waiting') waiting++;
    }
    return { checking, waiting, done: rows.length - checking - waiting };
  }, [rows]);
  // Events with an email thread still going (so Remind them shows "sent")
  const remindingEvents = useMemo(
    () => new Set(t.threads.filter(x => x.status === 'waiting' || x.status === 'replied').map(x => x.eventId.toString())),
    [t.threads]
  );
  // The business being simulated (the sidebar): names, labels, categories
  const scenario = useMemo(() => scenarioByKey(t.scenarioRows[0]?.key), [t.scenarioRows]);
  return {
    scenario,
    rows,
    rowBy,
    rowNumberBy,
    stateCounts,
    remindingEvents,
    docByEvent,
    docs,
    paymentsByDoc,
    paidByEvent,
    eventsSorted,
    eventBy,
    reviewBy,
    itemBy,
    itemsByEvent,
    openItems,
    detailBy,
    runsDesc,
    stepsByTask,
    threadsSorted,
    messagesByThread,
    followUpSteps,
    messagesByAsk,
  };
}

export type Live = ReturnType<typeof useLiveTables> & ReturnType<typeof useDerived>;

const LiveCtx = createContext<Live | null>(null);

// This only re-renders when one of its tables changes, so the value changes
// exactly then.
export function LiveProvider({ children }: { children: ReactNode }) {
  const t = useLiveTables();
  const d = useDerived(t);
  return <LiveCtx.Provider value={{ ...t, ...d }}>{children}</LiveCtx.Provider>;
}

export function useLive() {
  const live = useContext(LiveCtx);
  if (!live) throw new Error('useLive must be used inside LiveProvider');
  return live;
}

// The canvas's own shared state: where cards sit and which are open. Kept out
// of the live store so dragging or opening a card (many updates a second)
// doesn't redraw every card.
type Canvas = { cards: ReturnType<typeof useCanvasTables>['cards']; layout: ReturnType<typeof useCanvasTables>['layout'] };

function useCanvasTables() {
  const [cards] = useTable(tables.pipelineCard);
  const [layout] = useTable(tables.pipelineLayout);
  return { cards, layout };
}

const CanvasCtx = createContext<Canvas | null>(null);

export function CanvasStateProvider({ children }: { children: ReactNode }) {
  const { cards, layout } = useCanvasTables();
  const value = useMemo(() => ({ cards, layout }), [cards, layout]);
  return <CanvasCtx.Provider value={value}>{children}</CanvasCtx.Provider>;
}

export function useCanvasState() {
  const c = useContext(CanvasCtx);
  if (!c) throw new Error('useCanvasState must be used inside CanvasStateProvider');
  return c;
}
