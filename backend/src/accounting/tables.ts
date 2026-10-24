import { table, t } from 'spacetimedb/server';

// A small stand-in for QuickBooks: bills (we owe vendors), invoices (customers
// owe us) and the payments recorded against them. Field names follow
// QuickBooks so a real accounting source could replace it later.

export const DocumentLine = t.object('DocumentLine', {
  description: t.string(),
  amountMinor: t.i64(),
});

const documentColumns = {
  id: t.u64().primaryKey().autoInc(),
  docNumber: t.string(),
  txnDate: t.timestamp(),
  dueDate: t.timestamp(),
  lines: t.array(DocumentLine),
  totalMinor: t.i64(),
  // What is still unpaid; reaches 0 when fully paid
  balanceMinor: t.i64(),
  currency: t.string(),
  memo: t.string(),
  // 'open' | 'paid'
  status: t.string(),
  createdAt: t.timestamp(),
};

export const accountingBill = table(
  { name: 'accounting_bill', public: true },
  { ...documentColumns, vendor: t.string() }
);

export const accountingInvoice = table(
  { name: 'accounting_invoice', public: true },
  { ...documentColumns, customer: t.string() }
);

export const accountingPayment = table(
  { name: 'accounting_payment', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // 'bill' | 'invoice'
    docType: t.string(),
    docId: t.u64(),
    amountMinor: t.i64(),
    paidAt: t.timestamp(),
    // e.g. 'ach', 'card', 'check', 'wire'
    method: t.string(),
    reference: t.string(),
  }
);

export const accountingTables = { accountingBill, accountingInvoice, accountingPayment };
