import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { rowState, type Row } from './live';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
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
  const [cards] = useTable(tables.pipelineCard);
  const [layout] = useTable(tables.pipelineLayout);
  const [agentMessages] = useTable(tables.agentMessage);
  const [reportCharts] = useTable(tables.reportChart);
  const [classifications] = useTable(tables.classification);
  const [auditLog] = useTable(tables.auditLog);
  const [patterns] = useTable(tables.pattern);
  const [patternStates] = useTable(tables.patternState);
  const [classificationModes] = useTable(tables.classificationMode);
  return {
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
    cards,
    layout,
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
  // Messages Ask Settle sent, by the ask that sent them (oldest first)
  const messagesByAsk = useMemo(
    () => group([...t.agentMessages].sort(byId), m => m.askTaskId.toString()),
    [t.agentMessages]
  );
  const followUpSteps = useMemo(
    () => [...t.followUps].sort((a, b) => a.step - b.step).map(r => ({ delayMin: r.delayMin, message: r.message })),
    [t.followUps]
  );
  return {
    rows,
    rowBy,
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
