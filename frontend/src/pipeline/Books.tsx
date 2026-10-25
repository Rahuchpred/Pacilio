import { memo, useMemo, useState } from 'react';
import { useProcedure } from 'spacetimedb/react';
import { Button, Icon, Money, Status } from '../../../design-system/src/components';
import { procedures } from '../module_bindings';
import { FarCard, type CardLevels } from '../canvas/levels';
import { Card, CardTabs } from './Card';
import { DOC_STATUS, clock, daysOverdue, docState, dollars, openItem } from './live';
import { useLive, type Doc } from './store';

// QuickBooks: who owes whom. Bills are what we owe vendors; invoices what
// sponsors owe us. Payments come from the bank rows the Bookkeeper matched.
// An overdue invoice can be reminded (Remind them), which the pattern learner
// watches, so the Bookkeeper can learn to remind on its own.

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
// the amount and its status on the right. Overdue invoices can be reminded
// here (any open one from its item panel); only the latest wears the decide color.
const DocRow = memo(function DocRow({ d, books, decide }: { d: Doc; books: BooksData; decide: boolean }) {
  const { paymentsByDoc, rowNumber, reminding } = books;
  const remind = useProcedure(procedures.remindInvoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const send = () => {
    setBusy(true);
    setError(null);
    remind({ docNumber: d.docNumber })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

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
      {d.kind === 'invoice' && state === 'overdue' && (
        <div className="doc-actions nodrag">
          {reminding(d) ? (
            <span className="tertiary small doc-sent">
              <Icon name="mail" size={14} /> Reminder sent, waiting for a reply
            </span>
          ) : (
            <Button kind={decide ? 'decide' : 'quiet'} size="sm" icon="Send" pending={busy} disabled={busy} onClick={send}>
              Remind them
            </Button>
          )}
          {error && <span className="card-error small">{error}</span>}
        </div>
      )}
    </li>
  );
});

function Column({
  title,
  docs,
  empty,
  books,
  decideId,
}: {
  title: string;
  docs: Doc[];
  empty: string;
  books: BooksData;
  decideId?: string;
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
          <DocRow key={`${d.kind}:${d.id}`} d={d} books={books} decide={`${d.kind}:${d.id}` === decideId} />
        ))}
        {!shown.length && <li className="audit-empty">{empty}</li>}
      </ul>
    </section>
  );
}

function Full() {
  const books = useBooks();
  const { bills, invoices, open, overdue, reminding } = books;
  const lateInvoices = overdue
    .filter(d => d.kind === 'invoice')
    .sort((a, b) => a.dueDate.toDate().getTime() - b.dueDate.toDate().getTime());
  // The one call waiting on a person: remind the sponsor who is latest
  const first = lateInvoices.find(d => !reminding(d));
  const openBills = open(bills);
  const openInvoices = open(invoices);
  return (
    <Card type="books" icon="Document" title="QuickBooks" className="w-books-full">
      <p className="agent-built">
        We owe <Money value={sum(openBills)} /> on {plural(openBills.length, 'open bill')}. Sponsors owe us{' '}
        <Money value={sum(openInvoices)} /> on {plural(openInvoices.length, 'open invoice')}
        {lateInvoices.length > 0 ? `, ${lateInvoices.length} of them overdue.` : '.'}
      </p>
      <div className="books-cols">
        <Column title="Bills we owe" docs={bills} empty="No bills here." books={books} />
        <Column
          title="Invoices owed to us"
          docs={invoices}
          empty="No invoices here."
          books={books}
          decideId={first ? `invoice:${first.id}` : undefined}
        />
      </div>
      <p className="muted small">
        The Bookkeeper matches each bank payment to its bill or invoice. Remind them emails the sponsor; after a few reminders the
        Bookkeeper sends them itself.
      </p>
    </Card>
  );
}

export const quickbooks: CardLevels = { far: Far, full: Full };

// In the item panel: a bill or invoice's money trail, or which document a bank row paid.
export function BooksSection({ eventId }: { eventId: bigint }) {
  const { docByEvent, paidByEvent, docs, paymentsByDoc, rowBy } = useLive();
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
            <dt>{d.kind === 'bill' ? 'Vendor' : 'Sponsor'}</dt>
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
        {d.kind === 'invoice' && state !== 'paid' && <RemindButton d={d} />}
      </div>
    </section>
  );
}

function RemindButton({ d }: { d: Doc }) {
  const { threads } = useLive();
  const remind = useProcedure(procedures.remindInvoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const going = d.eventId !== undefined && threads.some(t => t.eventId === d.eventId && (t.status === 'waiting' || t.status === 'replied'));
  if (going) return <p className="muted small">A reminder is out; replies show in Emails.</p>;
  return (
    <div className="doc-actions">
      <Button
        kind="decide"
        size="sm"
        icon="Send"
        pending={busy}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          remind({ docNumber: d.docNumber })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        Remind them
      </Button>
      {error && <span className="card-error small">{error}</span>}
    </div>
  );
}
