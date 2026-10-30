import { memo, useMemo, useState } from 'react';
import { Icon, Money, Status } from '../../../design-system/src/components';
import { FarCard, type CardLevels } from '../canvas/levels';
import { Card, CardTabs } from './Card';
import { DOC_STATUS, clock, daysOverdue, docState, dollars, openItem } from './live';
import { useLive, type Doc } from './store';

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// QuickBooks: who owes whom. Bills are what we owe vendors; invoices what
// customers owe us. Payments come from the bank rows the Bookkeeper matched.

type Filter = 'open' | 'overdue' | 'paid';

function sum(docs: Doc[]): number {
  return docs.reduce((t, d) => t + dollars(d.balanceMinor, d.currency), 0);
}

// Everything here is worked out once per card (and once per data change), not
// per row: a card can list hundreds of bills and invoices.
function useBooks() {
  const { docs, paymentsByDoc, rowNumberBy, remindingEvents } = useLive();
  return useMemo(() => {
    const bills = docs.filter(d => d.kind === 'bill');
    const invoices = docs.filter(d => d.kind === 'invoice');
    const open = (list: Doc[]) => list.filter(d => d.balanceMinor > 0n);
    const overdue = docs.filter(d => docState(d) === 'overdue');
    const reminding = (d: Doc) => d.eventId !== undefined && remindingEvents.has(d.eventId.toString());
    return { bills, invoices, open, overdue, paymentsByDoc, rowNumber: rowNumberBy, reminding };
  }, [docs, paymentsByDoc, rowNumberBy, remindingEvents]);
}

type BooksData = ReturnType<typeof useBooks>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const days = (n: number) => plural(n, 'day');

// Like the ledger: one big number, the rest in the line. Plain paper; the
// orange belongs to Needs you, and overdue invoices show as a count.
function Far() {
  const { bills, invoices, open, overdue } = useBooks();
  return (
    <FarCard
      type="books"
      width="w-books"
      icon="Document"
      word="QuickBooks"
      big={<Money value={sum(open(invoices))} cents={false} />}
      line={
        <>
          owed to us · we owe <Money value={sum(open(bills))} cents={false} />
          {overdue.length ? ` · ${overdue.length} overdue` : ''}
        </>
      }
    />
  );
}

// One hairline row per bill or invoice: who and where it stands on the left,
// the amount and its status on the right.
const DocRow = memo(function DocRow({ d, books }: { d: Doc; books: BooksData }) {
  const { paymentsByDoc, rowNumber } = books;
  const state = docState(d);
  const left = dollars(d.balanceMinor, d.currency);
  const payments = paymentsByDoc.get(`${d.kind}:${d.id}`) ?? [];
  const late = daysOverdue(d.dueDate.toDate());
  const due = Math.ceil((d.dueDate.toDate().getTime() - Date.now()) / 86_400_000);
  const by = payments
    .map(p => {
      const row = p.reference.startsWith('event:') ? rowNumber.get(p.reference.slice(6)) : undefined;
      return row ? `row ${row}` : 'bank';
    })
    .join(', ');

  const line =
    state === 'paid' ? (
      `${d.kind === 'bill' ? 'Paid from the bank' : 'Paid into the bank'}${by ? `, ${by}` : ''}`
    ) : state === 'overdue' ? (
      <>
        {days(late)} late
        {left < dollars(d.totalMinor, d.currency) && (
          <>
            , <Money value={left} /> left
          </>
        )}
      </>
    ) : state === 'part_paid' ? (
      <>
        <Money value={left} /> left, due in {days(due)}
      </>
    ) : (
      `Due in ${days(due)}`
    );

  return (
    <li className="doc">
      <button type="button" className="doc-main" onClick={() => d.eventId !== undefined && openItem(d.eventId)}>
        <span className="doc-who">
          <span className="doc-party">{d.party}</span>
          <span className="doc-line">
            {d.docNumber} · {line}
          </span>
        </span>
        <span className="doc-amount">
          <Money value={dollars(d.totalMinor, d.currency)} />
        </span>
        <Status kind={DOC_STATUS[state].kind}>{DOC_STATUS[state].label}</Status>
      </button>
    </li>
  );
});

function Column({
  title,
  docs,
  empty,
  books,
}: {
  title: string;
  docs: Doc[];
  empty: string;
  books: BooksData;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const openCount = docs.filter(d => d.balanceMinor > 0n).length;
  const shown = docs
    .filter(d => (filter === 'paid' ? docState(d) === 'paid' : filter === 'overdue' ? docState(d) === 'overdue' : d.balanceMinor > 0n))
    .sort((a, b) => a.dueDate.toDate().getTime() - b.dueDate.toDate().getTime());
  return (
    <section className="books-col">
      <header className="books-col-head">
        <h4>{title}</h4>
        <span className="tertiary small">{docs.length}</span>
        <span className="books-col-tabs">
          <CardTabs
            label={`${title} filter`}
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'open', label: `Open ${openCount}` },
              {
                id: 'overdue',
                label: `Overdue ${docs.filter(d => docState(d) === 'overdue').length}`,
              },
              {
                id: 'paid',
                label: `Paid ${docs.filter(d => docState(d) === 'paid').length}`,
              },
            ]}
          />
        </span>
      </header>
      <ul className="docs nodrag nowheel">
        {shown.map(d => (
          <DocRow key={`${d.kind}:${d.id}`} d={d} books={books} />
        ))}
        {!shown.length && <li className="audit-empty">{empty}</li>}
      </ul>
    </section>
  );
}

function Full() {
  const books = useBooks();
  const { bills, invoices, open, overdue } = books;
  const customer = useLive().scenario.customerWord;
  const lateInvoices = overdue
    .filter(d => d.kind === 'invoice')
    .sort((a, b) => a.dueDate.toDate().getTime() - b.dueDate.toDate().getTime());
  const openBills = open(bills);
  const openInvoices = open(invoices);
  return (
    <Card type="books" icon="Document" title="QuickBooks" className="w-books-full">
      <p className="agent-built">
        We owe <Money value={sum(openBills)} /> on {plural(openBills.length, 'open bill')}. {capitalize(customer)}s owe us{' '}
        <Money value={sum(openInvoices)} /> on {plural(openInvoices.length, 'open invoice')}
        {lateInvoices.length > 0 ? `, ${lateInvoices.length} of them overdue.` : '.'}
      </p>
      <div className="books-cols">
        <Column title="Bills we owe" docs={bills} empty="No bills here." books={books} />
        <Column title="Invoices owed to us" docs={invoices} empty="No invoices here." books={books} />
      </div>
      <p className="muted small">
        The Bookkeeper matches each bank payment to its bill or invoice.
      </p>
    </Card>
  );
}

export const quickbooks: CardLevels = { far: Far, full: Full };

// In the item panel: a bill or invoice's money trail, or which document a bank row paid.
export function BooksSection({ eventId }: { eventId: bigint }) {
  const { docByEvent, paidByEvent, docs, paymentsByDoc, rowBy, scenario } = useLive();
  const doc = docByEvent.get(eventId.toString());
  const paid = paidByEvent.get(eventId.toString());
  const paidDoc = paid ? docs.find(d => d.kind === paid.kind && d.id === paid.docId) : undefined;
  if (!doc && !paidDoc) return null;

  if (!doc && paidDoc) {
    return (
      <section className="bill-card">
        <header className="bill-card-head">
          <span>
            <Icon name="Document" size={14} /> QuickBooks
          </span>
          <Status kind={DOC_STATUS[docState(paidDoc)].kind}>{DOC_STATUS[docState(paidDoc)].label}</Status>
        </header>
        <p className="bill-card-body bill-why">
          This {paidDoc.kind === 'bill' ? 'pays our bill' : 'is a payment on our invoice'}{' '}
          <button type="button" className="link-button" onClick={() => paidDoc.eventId !== undefined && openItem(paidDoc.eventId)}>
            {paidDoc.docNumber}
          </button>{' '}
          from {paidDoc.party}. The Bookkeeper matched it and Pacioli recorded the payment there.
        </p>
      </section>
    );
  }

  const d = doc!;
  const state = docState(d);
  const payments = paymentsByDoc.get(`${d.kind}:${d.id}`) ?? [];
  return (
    <section className="bill-card">
      <header className="bill-card-head">
        <span>
          <Icon name="Document" size={14} /> QuickBooks {d.kind === 'bill' ? 'bill we owe' : 'invoice owed to us'}
        </span>
        <Status kind={DOC_STATUS[state].kind}>{DOC_STATUS[state].label}</Status>
      </header>
      <div className="bill-card-body">
        <dl className="bill-rows is-flush">
          <div>
            <dt>{d.kind === 'bill' ? 'Vendor' : capitalize(scenario.customerWord)}</dt>
            <dd>{d.party}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>
              <Money value={dollars(d.totalMinor, d.currency)} />
            </dd>
          </div>
          <div>
            <dt>Still open</dt>
            <dd>
              <Money value={dollars(d.balanceMinor, d.currency)} />
            </dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>
              {d.dueDate.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}
              {state === 'overdue' && `, ${days(daysOverdue(d.dueDate.toDate()))} late`}
            </dd>
          </div>
        </dl>
        <ol className="doc-trail">
          <li>
            {d.txnDate.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}:{' '}
            {d.kind === 'bill' ? 'Bill received' : 'Invoice sent'}
          </li>
          {payments.map(p => {
            const bankId = p.reference.startsWith('event:') ? p.reference.slice(6) : '';
            const bank = bankId ? rowBy.get(bankId) : undefined;
            return (
              <li key={p.id.toString()}>
                {clock(p.paidAt.toDate())}: <Money value={dollars(p.amountMinor, d.currency)} />{' '}
                {d.kind === 'bill' ? 'paid from the bank' : 'paid into the bank'}
                {bank && (
                  <>
                    {' '}
                    (
                    <button type="button" className="link-button" onClick={() => openItem(bank.event.id)}>
                      {bank.event.counterparty}
                    </button>
                    ), matched by the Bookkeeper
                  </>
                )}
              </li>
            );
          })}
          {!payments.length && <li className="tertiary">No payment yet</li>}
        </ol>
      </div>
    </section>
  );
}
