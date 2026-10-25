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

// Money that left the bank with no bill behind it, as QuickBooks records it:
// an expense (already paid), not a bill (owed). When the vendor's bill
// arrives later, it is linked here and marked paid instead of being paid again.
export const accountingExpense = table(
  { name: 'accounting_expense', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    vendor: t.string(),
    // Positive: what was paid
    amountMinor: t.i64(),
    currency: t.string(),
    txnDate: t.timestamp(),
    category: t.string(),
    memo: t.string(),
    // The bank row that paid it
    eventId: t.u64().unique(),
    // 'no_bill' (asking for it) | 'matched' (the bill arrived and is linked)
    status: t.string(),
    billId: t.u64().optional(),
    createdAt: t.timestamp(),
  }
);

export const accountingTables = { accountingBill, accountingInvoice, accountingPayment, accountingExpense };
