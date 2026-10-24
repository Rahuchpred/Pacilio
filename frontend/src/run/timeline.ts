// The morning's run as a list of events, and the canvas state at any moment.
// Times are minutes after 9:00 am. Mock data until the agents write real rows.

export type NodeId =
  | 'inbox'
  | 'main'
  | 'sub-duplicate'
  | 'sub-coding'
  | 'sub-amount'
  | 'flagged'
  | 'ledger'
  | 'followups'
  | 'summary';

export type CheckId = 'sub-duplicate' | 'sub-coding' | 'sub-amount';
export type ActorKind = 'agent' | 'rule' | 'person';
export type Actor = { kind: ActorKind; name: string };
export type Decision = 'cap' | 'pay' | null;

export type Invoice = {
  id: string;
  vendor: string;
  short: string; // "Rivera 2231"
  number: string;
  amount: number;
  gl?: string;
  po?: string;
  duplicateOf?: string;
};

export const invoices: Invoice[] = [
  { id: 'rivera', vendor: 'Rivera Sound & Light', short: 'Rivera 2231', number: '2231', amount: 18400, gl: '6400 Production', po: 'PO 4402' },
  { id: 'halcyon', vendor: 'Halcyon Staffing', short: 'Halcyon HS-0912', number: 'HS-0912', amount: 6240, gl: '6300 Labor', po: 'PO 4410' },
  { id: 'northgate', vendor: 'Northgate Catering', short: 'Northgate 7781', number: '7781', amount: 3115.5, gl: '6120 Catering' },
  { id: 'rivera-copy', vendor: 'Rivera Sound & Light', short: 'Rivera 2231 copy', number: '2231', amount: 18400, duplicateOf: 'rivera' },
];

export const checks: { id: CheckId; name: string; job: string }[] = [
  { id: 'sub-duplicate', name: 'Duplicate check', job: 'Compares each invoice with the last 90 days.' },
  { id: 'sub-coding', name: 'Coding check', job: 'Checks vendor, GL code and tax fields.' },
  { id: 'sub-amount', name: 'Amount check', job: 'Matches each line to the PO and the contract.' },
];

export type Email = {
  id: string;
  invoice: string;
  to: string;
  address: string;
  subject: string;
  body: string;
};

export const emails: Email[] = [
  {
    id: 'mail-halcyon',
    invoice: 'halcyon',
    to: 'Halcyon Staffing',
    address: 'billing@halcyonstaffing.com',
    subject: 'HS-0912: 4 hours over PO 4410',
    body: 'Hi Dana, invoice HS-0912 bills 52 hours, but PO 4410 covers 48. Could you send the timesheets for the extra 4 hours on Oct 18? We are holding it until then.',
  },
  {
    id: 'mail-northgate',
    invoice: 'northgate',
    to: 'Northgate Catering',
    address: 'accounts@northgatecatering.com',
    subject: 'GL code on future invoices',
    body: 'Hi Priya, could you print GL 6120 on future invoices? It saves us a step on every one.',
  },
  {
    id: 'mail-rivera',
    invoice: 'rivera-copy',
    to: 'Rivera Sound & Light',
    address: 'ar@riverasound.com',
    subject: 'Invoice 2231 received once',
    body: 'Hi Luis, we got invoice 2231 twice this morning and kept the first copy. It pays Friday.',
  },
];

export type EventType =
  | 'arrive'
  | 'read'
  | 'check'
  | 'pass'
  | 'find'
  | 'fix'
  | 'drop'
  | 'flag'
  | 'post'
  | 'draft'
  | 'send'
  | 'decide';

export type RunEvent = {
  m: number;
  type: EventType;
  inv: string;
  agent?: CheckId;
  mail?: string;
  actor: Actor;
  text: string;
};

const MAIN: Actor = { kind: 'agent', name: 'Main agent' };
const DUP: Actor = { kind: 'agent', name: 'Duplicate check' };
const COD: Actor = { kind: 'agent', name: 'Coding check' };
const AMT: Actor = { kind: 'agent', name: 'Amount check' };
const INBOX: Actor = { kind: 'rule', name: 'Inbox' };
export const PERSON: Actor = { kind: 'person', name: 'Maya Chen' };

const actorOf: Record<CheckId, Actor> = { 'sub-duplicate': DUP, 'sub-coding': COD, 'sub-amount': AMT };

function checkAll(m: number, inv: string, short: string, results: Partial<Record<CheckId, string>>): RunEvent[] {
  const out: RunEvent[] = [];
  checks.forEach((c, i) => {
    out.push({ m, type: 'check', inv, agent: c.id, actor: MAIN, text: `Sent ${short} to the ${c.name.toLowerCase()}.` });
    const finding = results[c.id];
    out.push(
      finding
        ? { m: m + 1.4 + i * 0.2, type: 'find', inv, agent: c.id, actor: actorOf[c.id], text: finding }
        : { m: m + 0.8 + i * 0.2, type: 'pass', inv, agent: c.id, actor: actorOf[c.id], text: `Found nothing wrong with ${short}.` }
    );
  });
  return out;
}

const script: RunEvent[] = [
  { m: 12, type: 'arrive', inv: 'rivera', actor: INBOX, text: 'Rivera Sound & Light emailed invoice 2231.' },
  { m: 12.6, type: 'read', inv: 'rivera', actor: MAIN, text: 'Read Rivera 2231: $18,400.00 against PO 4402.' },
  ...checkAll(13.2, 'rivera', 'Rivera 2231', {}),
  { m: 15.2, type: 'post', inv: 'rivera', actor: MAIN, text: 'Posted Rivera 2231 to 6400 Production.' },

  { m: 40, type: 'arrive', inv: 'halcyon', actor: INBOX, text: 'Halcyon Staffing emailed invoice HS-0912.' },
  { m: 40.6, type: 'read', inv: 'halcyon', actor: MAIN, text: 'Read Halcyon HS-0912: $6,240.00 against PO 4410.' },
  ...checkAll(41.2, 'halcyon', 'Halcyon HS-0912', {
    'sub-amount': 'Halcyon HS-0912 billed 52 hours. PO 4410 covers 48, so it is $480.00 over.',
  }),
  { m: 43.6, type: 'flag', inv: 'halcyon', actor: MAIN, text: 'Asked Maya Chen about a $480.00 overage on Halcyon HS-0912.' },
  { m: 44.2, type: 'draft', inv: 'halcyon', mail: 'mail-halcyon', actor: MAIN, text: 'Wrote to Halcyon Staffing for the timesheets.' },
  { m: 46.0, type: 'send', inv: 'halcyon', mail: 'mail-halcyon', actor: MAIN, text: 'Sent the timesheet request to Halcyon Staffing.' },

  { m: 65, type: 'arrive', inv: 'northgate', actor: INBOX, text: 'Northgate Catering emailed invoice 7781.' },
  { m: 65.6, type: 'read', inv: 'northgate', actor: MAIN, text: 'Read Northgate 7781: $3,115.50, no PO.' },
  ...checkAll(66.2, 'northgate', 'Northgate 7781', {
    'sub-coding': 'Northgate 7781 had no GL code. Their last 6 invoices used 6120 Catering.',
  }),
  { m: 68.2, type: 'fix', inv: 'northgate', actor: MAIN, text: 'Coded Northgate 7781 to 6120 Catering from its last 6 invoices.' },
  { m: 68.8, type: 'post', inv: 'northgate', actor: MAIN, text: 'Posted Northgate 7781 to 6120 Catering.' },
  { m: 69.4, type: 'draft', inv: 'northgate', mail: 'mail-northgate', actor: MAIN, text: 'Drafted a note asking Northgate to print the GL code.' },

  { m: 82, type: 'arrive', inv: 'rivera-copy', actor: INBOX, text: 'Rivera Sound & Light emailed invoice 2231 again.' },
  { m: 82.6, type: 'read', inv: 'rivera-copy', actor: MAIN, text: 'Read Rivera 2231 a second time.' },
  ...checkAll(83.2, 'rivera-copy', 'Rivera 2231 copy', {
    'sub-duplicate': 'Rivera 2231 arrived twice. The 10:22 am copy matches the 9:12 am one line for line.',
  }),
  { m: 85.0, type: 'drop', inv: 'rivera-copy', actor: DUP, text: 'Dropped the second copy of Rivera 2231.' },
  { m: 85.6, type: 'draft', inv: 'rivera-copy', mail: 'mail-rivera', actor: MAIN, text: 'Wrote to Rivera Sound & Light about the copy.' },
  { m: 87.4, type: 'send', inv: 'rivera-copy', mail: 'mail-rivera', actor: MAIN, text: 'Told Rivera Sound & Light that 2231 pays Friday.' },
];

export const events = [...script].sort((a, b) => a.m - b.m);

export const START = 10;
export const END = 90;

/* ---------- Derived state ---------- */

export type InvoiceStage = 'waiting' | 'inbox' | 'reading' | 'checking' | 'fixing' | 'needs-you' | 'posting' | 'posted' | 'dropped';

export type InvoiceState = Invoice & {
  stage: InvoiceStage;
  at: NodeId | null;
  arrivedAt?: number;
  doneAt?: number;
  findings: { agent: CheckId; text: string }[];
  postedAmount?: number;
  postedBy?: Actor;
};

export type CheckState = {
  id: CheckId;
  name: string;
  job: string;
  working: string[]; // invoice ids being checked now
  checked: number;
  found: number;
  last?: { inv: string; text: string; kind: 'pass' | 'find'; m: number };
  outcome?: { fixedBy: Actor; text: string };
};

export type LedgerRow = {
  inv: string;
  line: string;
  gl: string;
  source: string;
  amount: number;
  actor: Actor;
  state: 'held' | 'writing' | 'posted';
  m: number;
};

export type MailState = Email & {
  state: 'drafting' | 'draft' | 'sending' | 'sent';
  typed: number; // 0..1 of the body written so far
  m: number;
};

export type Transfer = { edge: string; inv: string; label: string; progress: number };

export type RunState = {
  minute: number;
  clock: string;
  invoices: InvoiceState[];
  checks: CheckState[];
  main: { working: boolean; text: string };
  ledger: LedgerRow[];
  mails: MailState[];
  log: RunEvent[];
  transfers: Transfer[];
  active: Partial<Record<NodeId, string>>; // node -> what it is doing right now
  approval: { inv: string; decision: Decision } | null;
  totals: { arrived: number; processed: number; posted: number; held: number; dropped: number };
};

export function clockLabel(m: number) {
  const total = 9 * 60 + Math.floor(m);
  const h = Math.floor(total / 60);
  const min = total % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${suffix}`;
}

const TRAVEL = 0.6; // minutes an item takes to cross an edge
const WRITE = 1.0; // minutes a ledger row takes to write
const TYPE = 1.6; // minutes an email takes to write

function edgeFor(e: RunEvent): string | null {
  switch (e.type) {
    case 'read':
      return 'e-inbox-main';
    case 'check':
      return `e-main-${e.agent}`;
    case 'pass':
    case 'find':
      return `e-${e.agent}-main`;
    case 'flag':
      return 'e-main-flagged';
    case 'post':
      return 'e-main-ledger';
    case 'decide':
      return 'e-flagged-ledger';
    case 'draft':
      return 'e-ledger-follow';
    case 'send':
      return 'e-follow-summary';
    default:
      return null;
  }
}

function nodeFor(e: RunEvent): NodeId {
  switch (e.type) {
    case 'arrive':
      return 'inbox';
    case 'read':
    case 'fix':
      return 'main';
    case 'check':
    case 'pass':
    case 'find':
    case 'drop':
      return e.agent ?? 'sub-duplicate';
    case 'flag':
    case 'decide':
      return 'flagged';
    case 'post':
      return 'ledger';
    case 'draft':
    case 'send':
      return 'followups';
  }
}

export function stateAt(minute: number, decision: { choice: Decision; m: number } | null): RunState {
  const all = [...events];
  if (decision?.choice) {
    const amount = decision.choice === 'cap' ? 5760 : 6240;
    all.push({
      m: decision.m,
      type: 'decide',
      inv: 'halcyon',
      actor: PERSON,
      text:
        decision.choice === 'cap'
          ? 'Maya Chen capped Halcyon HS-0912 at $5,760.00.'
          : 'Maya Chen approved Halcyon HS-0912 at $6,240.00.',
    });
    all.push({
      m: decision.m + 0.01,
      type: 'post',
      inv: 'halcyon',
      actor: PERSON,
      text: `Posted Halcyon HS-0912 at $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
    });
  }
  const past = all.filter(e => e.m <= minute).sort((a, b) => a.m - b.m);

  const inv = new Map<string, InvoiceState>(
    invoices.map(i => [i.id, { ...i, stage: 'waiting', at: null, findings: [] } as InvoiceState])
  );
  const chk = new Map<CheckId, CheckState>(
    checks.map(c => [c.id, { ...c, working: [], checked: 0, found: 0 }])
  );
  const ledger: LedgerRow[] = [];
  const mails = new Map<string, MailState>();
  let approval: RunState['approval'] = null;
  let mainText = 'Waiting for invoices';

  for (const e of past) {
    const i = inv.get(e.inv)!;
    switch (e.type) {
      case 'arrive':
        i.stage = 'inbox';
        i.at = 'inbox';
        i.arrivedAt = e.m;
        break;
      case 'read':
        i.stage = 'reading';
        i.at = 'main';
        mainText = e.text;
        break;
      case 'check': {
        const c = chk.get(e.agent!)!;
        c.working.push(e.inv);
        i.stage = 'checking';
        i.at = 'main';
        mainText = `Checking ${i.short}`;
        break;
      }
      case 'pass':
      case 'find': {
        const c = chk.get(e.agent!)!;
        c.working = c.working.filter(x => x !== e.inv);
        c.checked += 1;
        c.last = { inv: e.inv, text: e.text, kind: e.type, m: e.m };
        if (e.type === 'find') {
          c.found += 1;
          i.findings.push({ agent: e.agent!, text: e.text });
          i.stage = 'fixing';
        }
        break;
      }
      case 'fix':
        i.stage = 'posting';
        mainText = e.text;
        chk.get('sub-coding')!.outcome = { fixedBy: MAIN, text: 'Main agent coded it to 6120.' };
        break;
      case 'drop':
        i.stage = 'dropped';
        i.at = 'sub-duplicate';
        i.doneAt = e.m;
        chk.get('sub-duplicate')!.outcome = { fixedBy: DUP, text: 'Dropped the copy.' };
        break;
      case 'flag':
        i.stage = 'needs-you';
        i.at = 'flagged';
        approval = { inv: e.inv, decision: null };
        mainText = e.text;
        chk.get('sub-amount')!.outcome = { fixedBy: PERSON, text: 'Waiting on Maya Chen.' };
        ledger.push({
          inv: e.inv,
          line: i.vendor,
          gl: i.gl ?? '',
          source: 'Held',
          amount: i.amount,
          actor: PERSON,
          state: 'held',
          m: e.m,
        });
        break;
      case 'decide':
        if (approval) approval.decision = decision?.choice ?? null;
        chk.get('sub-amount')!.outcome = { fixedBy: PERSON, text: e.text };
        break;
      case 'post': {
        const amount = e.inv === 'halcyon' && decision?.choice === 'cap' ? 5760 : i.amount;
        const existing = ledger.find(r => r.inv === e.inv);
        const row: LedgerRow = {
          inv: e.inv,
          line: i.vendor,
          gl: i.gl ?? '',
          source: e.inv === 'northgate' ? '6 past invoices' : e.inv === 'halcyon' ? 'Maya Chen' : i.po ?? '',
          amount,
          actor: e.actor,
          state: minute - e.m < WRITE ? 'writing' : 'posted',
          m: e.m,
        };
        if (existing) Object.assign(existing, row);
        else ledger.push(row);
        i.stage = row.state === 'writing' ? 'posting' : 'posted';
        i.at = 'ledger';
        i.postedAmount = amount;
        i.postedBy = e.actor;
        if (row.state === 'posted') i.doneAt = e.m + WRITE;
        if (e.actor.kind === 'agent') mainText = e.text;
        break;
      }
      case 'draft': {
        const mail = emails.find(x => x.id === e.mail)!;
        const typed = Math.min(1, (minute - e.m) / TYPE);
        mails.set(mail.id, { ...mail, state: typed < 1 ? 'drafting' : 'draft', typed, m: e.m });
        break;
      }
      case 'send': {
        const ms = mails.get(e.mail!)!;
        ms.state = minute - e.m < TRAVEL ? 'sending' : 'sent';
        ms.typed = 1;
        break;
      }
    }
  }

  // Items crossing edges right now
  const transfers: Transfer[] = [];
  for (const e of past) {
    const edge = edgeFor(e);
    const p = (minute - e.m) / TRAVEL;
    if (edge && p >= 0 && p < 1) {
      const i = inv.get(e.inv)!;
      transfers.push({ edge, inv: e.inv, label: e.type === 'draft' || e.type === 'send' ? 'Email' : i.short, progress: p });
    }
  }

  // What each node is doing right now
  const active: RunState['active'] = {};
  for (const e of past) {
    if (minute - e.m < 1.2) active[nodeFor(e)] = e.text;
  }
  for (const c of chk.values()) {
    if (c.working.length) active[c.id] = `Checking ${inv.get(c.working[0])!.short}`;
  }
  for (const m of mails.values()) {
    if (m.state === 'drafting') active.followups = `Writing to ${m.to}`;
  }

  const list = [...inv.values()];
  const arrived = list.filter(i => i.stage !== 'waiting');
  const counted = arrived.filter(i => i.stage !== 'dropped');
  const posted = ledger.filter(r => r.state !== 'held').reduce((t, r) => t + r.amount, 0);
  const held = ledger.filter(r => r.state === 'held').reduce((t, r) => t + r.amount, 0);

  return {
    minute,
    clock: clockLabel(minute),
    invoices: list,
    checks: [...chk.values()],
    main: { working: Boolean(active.main) || [...chk.values()].some(c => c.working.length > 0), text: mainText },
    ledger,
    mails: [...mails.values()],
    log: past.filter(e => e.type !== 'check' && e.type !== 'pass'),
    transfers,
    active,
    approval,
    totals: {
      arrived: arrived.length,
      processed: counted.reduce((t, i) => t + i.amount, 0),
      posted,
      held,
      dropped: arrived.length - counted.length,
    },
  };
}

// Pacing for replay: slow near events so work is visible, fast through idle
// gaps, and never jump past a busy stretch even when frames are slow.
const SLOW = 0.75; // virtual minutes per real second near events
const FAST = 14; // virtual minutes per real second between them

export function advance(minute: number, dt: number, extra: number[] = []): number {
  const marks = [...events.map(e => e.m), ...extra].sort((a, b) => a - b);
  let m = minute;
  let left = dt;
  while (left > 1e-6) {
    const near = marks.some(x => m > x - 0.6 && m < x + 1.8);
    if (near) {
      const step = Math.min(left, 0.1);
      m += step * SLOW;
      left -= step;
    } else {
      const next = marks.find(x => x - 0.6 > m);
      const target = next === undefined ? Infinity : next - 0.6 + 1e-6;
      const need = (target - m) / FAST;
      if (need >= left) {
        m += left * FAST;
        left = 0;
      } else {
        m = target;
        left -= need;
      }
    }
  }
  return m;
}
