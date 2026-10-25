// Pacioli's own check on every bank row that pays a bill, whatever the
// Bookkeeper decided: paying more than the bill has open, or paying a bill
// that is already paid, always goes to a person. Plain functions, so they run
// (and are tested) without the database.

export type PaymentProblem =
  | { kind: 'overpaid'; extraMinor: bigint }
  | { kind: 'paid_twice' };

// amountMinor is the bank row (negative: money out); balanceMinor what the bill
// still had open before this row
export function checkBillPayment(amountMinor: bigint, balanceMinor: bigint): PaymentProblem | undefined {
  if (amountMinor >= 0n) return undefined;
  const paid = -amountMinor;
  if (balanceMinor <= 0n) return { kind: 'paid_twice' };
  if (paid > balanceMinor) return { kind: 'overpaid', extraMinor: paid - balanceMinor };
  return undefined;
}

export interface PaymentFacts {
  vendor: string;
  // Where the payment came from, as people read it ("Nessie")
  source: string;
  amountMinor: bigint;
  date: Date;
  row: number;
  doc: string;
  totalMinor: bigint;
  balanceMinor: bigint;
  // Rows that already paid this bill
  earlierRows: number[];
}

// Same shape as the Bookkeeper's review write-up (pipeline.ts)
export interface PaymentWriteUp {
  title: string;
  what_happened: string;
  evidence: string[];
  action: 'follow_up';
  fix: string;
  question: string;
  follow_up_to: string;
  follow_up_subject: string;
  follow_up_message: string;
}

export function money(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${whole}.${(abs % 100n).toString().padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

export function paymentWriteUp(problem: PaymentProblem, f: PaymentFacts): PaymentWriteUp {
  const paid = money(f.amountMinor);
  const earlier = f.earlierRows.length ? ` (row ${f.earlierRows.join(', ')})` : '';
  const evidence = [
    `Row ${f.row} · ${f.source} · −${paid} · ${day(f.date)}`,
    `QuickBooks bill ${f.doc} · ${money(f.totalMinor)} · ${money(f.balanceMinor)} open before this payment`,
    'Flagged by Pacioli’s payment check',
  ];
  if (problem.kind === 'overpaid') {
    const extra = money(problem.extraMinor);
    return {
      title: `${f.vendor} overpaid on bill ${f.doc}`,
      what_happened: `The bank paid ${f.vendor} ${paid} on ${day(f.date)} (row ${f.row}). Bill ${f.doc} had ${money(f.balanceMinor)} open, so we paid ${extra} more than we owed.`,
      evidence,
      action: 'follow_up',
      fix: `Ask ${f.vendor} to refund the extra ${extra}.`,
      question: `Email ${f.vendor} to refund the extra ${extra}?`,
      follow_up_to: f.vendor,
      follow_up_subject: `Overpayment on bill ${f.doc}`,
      follow_up_message: `Hello ${f.vendor},\n\nOn ${day(f.date)} we paid ${paid} against bill ${f.doc}, which had ${money(f.balanceMinor)} open. That is ${extra} more than the bill. Could you refund the extra ${extra}, or confirm it as a credit on our account?\n\nThank you.`,
    };
  }
  return {
    title: `${f.vendor} paid twice for bill ${f.doc}`,
    what_happened: `The bank paid ${f.vendor} ${paid} on ${day(f.date)} (row ${f.row}), but bill ${f.doc} for ${money(f.totalMinor)} was already paid in full${earlier}.`,
    evidence,
    action: 'follow_up',
    fix: `Ask ${f.vendor} to refund the second ${paid} payment.`,
    question: `Email ${f.vendor} to refund the second ${paid} payment?`,
    follow_up_to: f.vendor,
    follow_up_subject: `Duplicate payment for bill ${f.doc}`,
    follow_up_message: `Hello ${f.vendor},\n\nOn ${day(f.date)} we paid ${paid} against bill ${f.doc}, but that bill for ${money(f.totalMinor)} had already been paid in full. Could you refund the second payment of ${paid}?\n\nThank you.`,
  };
}
