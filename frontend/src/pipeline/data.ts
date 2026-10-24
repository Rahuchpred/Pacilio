// Mock data for the process canvas. Shapes only; nothing here is wired to SpacetimeDB yet.
import type { StatusKind } from '../../../design-system/src/components';

export type Email = {
  vendor: string;
  invoice: string;
  amount: number;
  time: string;
  note?: string;
};

export const inbox: Email[] = [
  { vendor: 'Rivera Sound & Light', invoice: '2231', amount: 18400, time: '9:12 am' },
  { vendor: 'Halcyon Staffing', invoice: 'HS-0912', amount: 6240, time: '9:40 am' },
  { vendor: 'Northgate Catering', invoice: '7781', amount: 3115.5, time: '10:05 am' },
  { vendor: 'Rivera Sound & Light', invoice: '2231', amount: 18400, time: '10:22 am', note: 'Resent' },
];

export type Route = {
  vendor: string;
  invoice: string;
  to: string;
  status: StatusKind;
  result: string;
};

export const routes: Route[] = [
  { vendor: 'Rivera Sound & Light', invoice: '2231', to: 'No issues', status: 'cleared', result: 'Posted' },
  { vendor: 'Rivera Sound & Light', invoice: '2231 copy', to: 'Duplicate check', status: 'cleared', result: 'Dropped' },
  { vendor: 'Northgate Catering', invoice: '7781', to: 'Coding check', status: 'cleared', result: 'Coded' },
  { vendor: 'Halcyon Staffing', invoice: 'HS-0912', to: 'Amount check', status: 'needs', result: 'Sent to you' },
];

export type Subagent = {
  id: string;
  name: string;
  job: string;
  finding: string;
  fixedBy: 'subagent' | 'main' | 'person';
  outcome: string;
  status: StatusKind;
  statusLabel: string;
};

export const subagents: Subagent[] = [
  {
    id: 'sub-duplicate',
    name: 'Duplicate check',
    job: 'Compares each invoice with the last 90 days',
    finding: 'Rivera 2231 arrived twice. The 10:22 am copy matched the 9:12 am one line for line.',
    fixedBy: 'subagent',
    outcome: 'Dropped the copy',
    status: 'cleared',
    statusLabel: 'Fixed here',
  },
  {
    id: 'sub-coding',
    name: 'Coding check',
    job: 'Checks vendor, GL code and tax fields',
    finding: 'Northgate 7781 had no GL code. Their last 6 invoices used 6120 Catering.',
    fixedBy: 'main',
    outcome: 'Main agent coded it to 6120',
    status: 'agent',
    statusLabel: 'Sent back',
  },
  {
    id: 'sub-amount',
    name: 'Amount check',
    job: 'Matches lines to the PO and the contract',
    finding: 'Halcyon HS-0912 billed 52 hours. PO 4410 covers 48, so it is $480.00 over.',
    fixedBy: 'person',
    outcome: 'Main agent was unsure, flagged it',
    status: 'disputed',
    statusLabel: 'Over PO',
  },
];

export type LedgerRow = {
  vendor: string;
  gl: string;
  amount: number;
  actor: string;
  actorKind: 'agent' | 'rule' | 'person';
  status: StatusKind;
  statusLabel: string;
};

export const ledger: LedgerRow[] = [
  { vendor: 'Rivera Sound & Light', gl: '6400 Production', amount: 18400, actor: 'Main agent', actorKind: 'agent', status: 'cleared', statusLabel: 'Posted' },
  { vendor: 'Northgate Catering', gl: '6120 Catering', amount: 3115.5, actor: 'Main agent', actorKind: 'agent', status: 'cleared', statusLabel: 'Posted' },
  { vendor: 'Halcyon Staffing', gl: '6300 Labor', amount: 6240, actor: 'Waiting on you', actorKind: 'person', status: 'held', statusLabel: 'Held' },
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
    to: 'billing@halcyonstaffing.com',
    subject: 'HS-0912: 4 hours over PO 4410',
    body: 'Asked for the timesheets behind the extra 4 hours on Oct 18.',
    status: 'held',
    statusLabel: 'Waiting on reply',
    time: '10:41 am',
  },
  {
    to: 'ar@riverasound.com',
    subject: 'Invoice 2231 received once',
    body: 'Told them the 10:22 am copy was dropped and 2231 pays Friday.',
    status: 'cleared',
    statusLabel: 'Sent',
    time: '10:38 am',
  },
  {
    to: 'accounts@northgatecatering.com',
    subject: 'GL code on future invoices',
    body: 'Asks them to print 6120 on invoices going forward.',
    status: 'agent',
    statusLabel: 'Drafted',
    time: '10:44 am',
  },
];

export const summary = {
  processed: 27755.5,
  cleared: 21515.5,
  held: 6240,
  read: 4,
  clean: 1,
  fixedBySubagent: 1,
  fixedByMain: 1,
  waitingOnYou: 1,
  medianToPost: '3 min 40 s',
  // Minutes after 9:00 am that each invoice arrived and when it settled.
  timeline: [
    { label: 'Rivera 2231', in: 12, out: 15, status: 'cleared' as StatusKind },
    { label: 'Halcyon HS-0912', in: 40, out: null, status: 'held' as StatusKind },
    { label: 'Northgate 7781', in: 65, out: 69, status: 'cleared' as StatusKind },
    { label: 'Rivera 2231 copy', in: 82, out: 83, status: 'cleared' as StatusKind },
  ],
  now: 104,
};
