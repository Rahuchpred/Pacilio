// Mock data for the process canvas. Shapes only; nothing here is wired to SpacetimeDB yet.
import type { IconName, StatusKind } from '../../../design-system/src/components';

export type ActorKind = 'agent' | 'rule' | 'person';

export type Email = {
  vendor: string;
  invoice: string;
  amount: number;
  time: string;
  status: StatusKind;
  statusLabel: string;
};

export const inbox: Email[] = [
  { vendor: 'Rivera Sound & Light', invoice: '2231', amount: 18400, time: '9:12 am', status: 'cleared', statusLabel: 'Posted' },
  { vendor: 'Halcyon Staffing', invoice: 'HS-0912', amount: 6240, time: '9:40 am', status: 'needs', statusLabel: 'Needs you' },
  { vendor: 'Northgate Catering', invoice: '7781', amount: 3115.5, time: '10:05 am', status: 'cleared', statusLabel: 'Posted' },
  { vendor: 'Rivera Sound & Light', invoice: '2231 copy', amount: 18400, time: '10:22 am', status: 'agent', statusLabel: 'Dropped' },
];

export type LogRow = { time: string; text: string; actor: string; actorKind: ActorKind };

export const agentLog: LogRow[] = [
  { time: '9:12', text: 'Matched Rivera 2231 to PO 4402 and posted it.', actor: 'Main agent', actorKind: 'agent' },
  { time: '9:40', text: 'Sent Halcyon HS-0912 to the amount check.', actor: 'Main agent', actorKind: 'agent' },
  { time: '9:44', text: 'Asked Maya Chen about a $480.00 overage.', actor: 'Main agent', actorKind: 'agent' },
  { time: '10:07', text: 'Coded Northgate 7781 to 6120 Catering.', actor: 'Main agent', actorKind: 'agent' },
  { time: '10:22', text: 'Dropped a second copy of Rivera 2231.', actor: 'Duplicate check', actorKind: 'agent' },
];

export type Subagent = {
  id: string;
  name: string;
  job: string;
  finding: string;
  fixedBy: string;
  fixedByKind: ActorKind;
  status: StatusKind;
  statusLabel: string;
};

export const subagents: Subagent[] = [
  {
    id: 'sub-duplicate',
    name: 'Duplicate check',
    job: 'Compares each invoice with the last 90 days.',
    finding: 'Rivera 2231 arrived twice. The 10:22 am copy matched the 9:12 am one line for line.',
    fixedBy: 'Duplicate check',
    fixedByKind: 'agent',
    status: 'cleared',
    statusLabel: 'Fixed',
  },
  {
    id: 'sub-coding',
    name: 'Coding check',
    job: 'Checks vendor, GL code and tax fields.',
    finding: 'Northgate 7781 had no GL code. Their last 6 invoices used 6120 Catering.',
    fixedBy: 'Main agent',
    fixedByKind: 'agent',
    status: 'agent',
    statusLabel: 'Sent back',
  },
  {
    id: 'sub-amount',
    name: 'Amount check',
    job: 'Matches each line to the PO and the contract.',
    finding: 'Halcyon HS-0912 billed 52 hours. PO 4410 covers 48, so it is $480.00 over.',
    fixedBy: 'Maya Chen',
    fixedByKind: 'person',
    status: 'disputed',
    statusLabel: 'Over PO',
  },
];

export const escalation = {
  asker: 'Main agent',
  waitingOn: 'Maya Chen',
  facts: [
    { k: 'Invoice HS-0912', v: 6240 },
    { k: 'PO 4410 covers', v: 5760 },
    { k: 'Over by', v: 480 },
  ],
  hold: "Held until Friday's pay run",
  sources: [
    { source: 'Invoice HS-0912', detail: 'Halcyon Staffing, 52 hours at $120.00' },
    { source: 'PO 4410', detail: 'Approved Oct 2, 48 hours' },
    { source: 'Your past answers', detail: 'Approved 3 of 5 Halcyon overages' },
  ],
};

export type SheetRow = {
  line: string;
  sub: string;
  source: string;
  sourceIcon: IconName;
  actor: string;
  actorKind: ActorKind;
  amount: number;
  flagged?: boolean;
};

export const ledger: SheetRow[] = [
  { line: 'Rivera Sound & Light', sub: '6400 Production', source: 'PO 4402', sourceIcon: 'doc', actor: 'Main agent', actorKind: 'agent', amount: 18400 },
  { line: 'Northgate Catering', sub: '6120 Catering', source: '6 past invoices', sourceIcon: 'rule', actor: 'Main agent', actorKind: 'agent', amount: 3115.5 },
  { line: 'Halcyon Staffing', sub: '6300 Labor', source: 'Held', sourceIcon: 'clock', actor: 'Maya Chen', actorKind: 'person', amount: 6240, flagged: true },
];

export type FollowUp = {
  to: string;
  subject: string;
  body: string;
  status: StatusKind;
  statusLabel: string;
  time: string;
};

export const followUps: FollowUp[] = [
  {
    to: 'Halcyon Staffing',
    subject: 'HS-0912: 4 hours over PO 4410',
    body: 'Could you send the timesheets behind the extra 4 hours on Oct 18? We are holding the invoice until then.',
    status: 'held',
    statusLabel: 'Waiting',
    time: '10:41 am',
  },
  {
    to: 'Rivera Sound & Light',
    subject: 'Invoice 2231 received once',
    body: 'We got 2231 twice and kept the first. It pays Friday.',
    status: 'cleared',
    statusLabel: 'Sent',
    time: '10:38 am',
  },
  {
    to: 'Northgate Catering',
    subject: 'GL code on future invoices',
    body: 'Please print 6120 on invoices going forward.',
    status: 'agent',
    statusLabel: 'Draft',
    time: '10:44 am',
  },
];

export const summary = {
  processed: 27755.5,
  cleared: 21515.5,
  held: 6240,
  rows: [
    { label: 'No issues', value: '1' },
    { label: 'Fixed by a check', value: '1' },
    { label: 'Fixed by main agent', value: '1' },
    { label: 'Waiting on Maya Chen', value: '1' },
    { label: 'Median time to post', value: '3 min 40 s' },
  ],
  // Minutes after 9:00 am that each invoice arrived and settled.
  timeline: [
    { label: 'Rivera 2231', in: 12, out: 15, status: 'cleared' as StatusKind },
    { label: 'Halcyon HS-0912', in: 40, out: null, status: 'held' as StatusKind },
    { label: 'Northgate 7781', in: 65, out: 69, status: 'cleared' as StatusKind },
    { label: 'Rivera 2231 copy', in: 82, out: 83, status: 'cleared' as StatusKind },
  ],
  now: 104,
};
