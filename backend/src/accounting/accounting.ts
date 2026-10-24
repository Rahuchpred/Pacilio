import { Timestamp } from 'spacetimedb';
import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { DocumentLine } from './tables';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type Line = { description: string; amountMinor: bigint };

const DOC_TYPES = ['bill', 'invoice'] as const;

// 'YYYY-MM-DD' (or any ISO date) → Timestamp
function parseDate(value: string, field: string): Timestamp {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new SenderError(`${field} must be an ISO date, got "${value}"`);
  return Timestamp.fromDate(date);
}

function validateDocument(party: string, docNumber: string, lines: Line[]): bigint {
  if (!party.trim()) throw new SenderError('Vendor/customer must not be empty');
  if (!docNumber.trim()) throw new SenderError('docNumber must not be empty');
  if (!lines.length) throw new SenderError('A document needs at least one line');
  const total = lines.reduce((sum, l) => sum + l.amountMinor, 0n);
  if (total <= 0n) throw new SenderError('Document total must be positive');
  return total;
}

function documentRow(ctx: Ctx, args: {
  docNumber: string; txnDate: string; dueDate: string; lines: Line[]; currency: string; memo: string;
}, total: bigint) {
  return {
    id: 0n,
    docNumber: args.docNumber.trim(),
    txnDate: parseDate(args.txnDate, 'txnDate'),
    dueDate: parseDate(args.dueDate, 'dueDate'),
    lines: args.lines,
    totalMinor: total,
    balanceMinor: total,
    currency: args.currency || 'USD',
    memo: args.memo,
    status: 'open',
    createdAt: ctx.timestamp,
  };
}

const documentArgs = {
  docNumber: t.string(),
  txnDate: t.string(),
  dueDate: t.string(),
  lines: t.array(DocumentLine),
  currency: t.string(),
  memo: t.string(),
};

export function accounting(stdb: Schema) {
  // A vendor bill we owe, e.g. the AV company's invoice to us.
  const createBill = stdb.reducer(
    { vendor: t.string(), ...documentArgs },
    (ctx, args) => {
      const total = validateDocument(args.vendor, args.docNumber, args.lines);
      ctx.db.accountingBill.insert({ ...documentRow(ctx, args, total), vendor: args.vendor.trim() });
    }
  );

  // An invoice we sent a customer, e.g. a sponsor or a venue settlement.
  const createInvoice = stdb.reducer(
    { customer: t.string(), ...documentArgs },
    (ctx, args) => {
      const total = validateDocument(args.customer, args.docNumber, args.lines);
      ctx.db.accountingInvoice.insert({ ...documentRow(ctx, args, total), customer: args.customer.trim() });
    }
  );

  // Record money paid against a bill or received against an invoice.
  // Partial payments reduce the balance; the document is paid at 0.
  const recordPayment = stdb.reducer(
    {
      docType: t.string(),
      docId: t.u64(),
      amountMinor: t.i64(),
      paidAt: t.string(),
      method: t.string(),
      reference: t.string(),
    },
    (ctx, { docType, docId, amountMinor, paidAt, method, reference }) => {
      if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
        throw new SenderError(`docType must be one of ${DOC_TYPES.join(', ')}`);
      }
      if (amountMinor <= 0n) throw new SenderError('Payment amount must be positive');

      const table = docType === 'bill' ? ctx.db.accountingBill : ctx.db.accountingInvoice;
      const doc = table.id.find(docId);
      if (!doc) throw new SenderError(`${docType} ${docId} not found`);
      if (amountMinor > doc.balanceMinor) {
        throw new SenderError(`Payment ${amountMinor} exceeds open balance ${doc.balanceMinor}`);
      }

      const balanceMinor = doc.balanceMinor - amountMinor;
      // Same shape on both tables; the union of update signatures needs a cast
      (table.id.update as (row: typeof doc) => void)({
        ...doc,
        balanceMinor,
        status: balanceMinor === 0n ? 'paid' : 'open',
      });
      ctx.db.accountingPayment.insert({
        id: 0n,
        docType,
        docId,
        amountMinor,
        paidAt: parseDate(paidAt, 'paidAt'),
        method,
        reference,
      });
    }
  );

  return { createBill, createInvoice, recordPayment };
}
