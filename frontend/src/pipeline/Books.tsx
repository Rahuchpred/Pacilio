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

function Far() {
  const { bills, invoices, open, overdue } = useBooks();
  return (
    <FarCard
      type="books"
      width="w-books"
      icon="Document"
      word="QuickBooks"
      big={
        <span className="books-far">
          <Money value={-sum(open(bills))} cents={false} />
          <span className="books-far-sep">/</span>
          <Money value={sum(open(invoices))} sign cents={false} />
        </span>
      }
      line={`we owe / owed to us${overdue.length ? ` · ${overdue.length} overdue` : ''}`}
      craft={overdue.some(d => d.kind === 'invoice') ? 'decide' : undefined}
    />
  );
}

const DocRow = memo(function DocRow({ d, books }: { d: Doc; books: BooksData }) {
  const { paymentsByDoc, rowNumber, reminding } = books;
  const remind = useProcedure(procedures.remindInvoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = docState(d);
  const total = dollars(d.totalMinor, d.currency);
  const left = dollars(d.balanceMinor, d.currency);
  const paidShare = total ? Math.max(0, Math.min(1, (total - left) / total)) : 1;
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
    state === 'paid'
      ? `Paid${d.kind === 'bill' ? ' by bank' : ' into the bank'}${by ? `, ${by}` : ''}`
      : state === 'overdue'
        ? `${late} ${late === 1 ? 'day' : 'days'} overdue${state === 'overdue' && left < total ? ` · $${left.toLocaleString('en-US')} left` : ''}`
        : state === 'part_paid'
          ? `$${left.toLocaleString('en-US', { minimumFractionDigits: 2 })} left · due in ${due} ${due === 1 ? 'day' : 'days'}`
          : `Due in ${due} ${due === 1 ? 'day' : 'days'}`;

  const send = () => {
    setBusy(true);
    setError(null);
    remind({ docNumber: d.docNumber })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <li className={`doc is-${state}`}>
      <button type="button" className="doc-main" onClick={() => d.eventId !== undefined && openItem(d.eventId)}>
        <span className="doc-head">
          <span className="strong doc-party">{d.party}</span>
          <span className="muted small">{d.docNumber}</span>
        </span>
        <span className="doc-amount">
          <Money value={total} />
        </span>
        <span className="doc-bar" aria-hidden="true">
          <span style={{ width: `${paidShare * 100}%` }} />
        </span>
        <span className={`doc-line small${state === 'overdue' ? ' is-late' : ''}`}>
          <Status kind={DOC_STATUS[state].kind}>{DOC_STATUS[state].label}</Status>
          {line}
        </span>
      </button>
      {d.kind === 'invoice' && state !== 'paid' && (
        <div className="doc-actions nodrag">
          {reminding(d) ? (
            <span className="muted small">
              <Icon name="mail" size={12} /> Reminder sent, waiting for a reply
            </span>
          ) : (
            <Button kind={state === 'overdue' ? 'decide' : 'quiet'} size="sm" icon="Send" pending={busy} disabled={busy} onClick={send}>
              Remind them
            </Button>
          )}
          {error && <span className="card-error small">{error}</span>}
        </div>
      )}
    </li>
  );
});

function Column({ title, docs, empty, books }: { title: string; docs: Doc[]; empty: string; books: BooksData }) {
  const [filter, setFilter] = useState<Filter>('open');
  const shown = docs
    .filter(d => (filter === 'paid' ? docState(d) === 'paid' : filter === 'overdue' ? docState(d) === 'overdue' : d.balanceMinor > 0n))
    .sort((a, b) => a.dueDate.toDate().getTime() - b.dueDate.toDate().getTime());
  return (
    <section className="books-col">
      <div className="books-col-head">
        <h4 className="section-label">{title}</h4>
        <CardTabs
          label={`${title} filter`}
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'open', label: `Open (${docs.filter(d => d.balanceMinor > 0n).length})` },
            { id: 'overdue', label: `Overdue (${docs.filter(d => docState(d) === 'overdue').length})` },
            { id: 'paid', label: `Paid (${docs.filter(d => docState(d) === 'paid').length})` },
          ]}
        />
      </div>
      <ul className="docs nodrag nowheel">
        {shown.map(d => (
          <DocRow key={`${d.kind}:${d.id}`} d={d} books={books} />
        ))}
        {!shown.length && <li className="muted small">{empty}</li>}
      </ul>
    </section>
  );
}

function Full() {
  const books = useBooks();
  const { bills, invoices, open, overdue } = books;
  const lateInvoices = overdue.filter(d => d.kind === 'invoice');
  return (
    <Card type="books" icon="Document" title="QuickBooks" className="w-books-full" meta={<span className="muted small">Who owes whom · {clock(new Date())}</span>}>
      <dl className="counts">
        <div>
          <dt>We owe</dt>
          <dd>
            <Money value={-sum(open(bills))} />
          </dd>
        </div>
        <div>
          <dt>Owed to us</dt>
          <dd>
            <Money value={sum(open(invoices))} />
          </dd>
        </div>
        <div>
          <dt>Overdue</dt>
          <dd>
            {overdue.length} <span className="muted small">({lateInvoices.length} owed to us)</span>
          </dd>
        </div>
      </dl>
      <div className="books-cols">
        <Column title="We owe (bills)" docs={bills} empty="Nothing here." books={books} />
        <Column title="Owed to us (invoices)" docs={invoices} empty="Nothing here." books={books} />
      </div>
      <p className="muted small">
        Bills are paid from the bank and invoices into it; the Bookkeeper matches each payment and Settle records it here.
        Remind them emails the sponsor; once people remind the same way a few times, the Bookkeeper learns to.
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
        <p>
          This {paidDoc.kind === 'bill' ? 'pays our bill' : 'is a payment on our invoice'}{' '}
          <button type="button" className="link-button" onClick={() => paidDoc.eventId !== undefined && openItem(paidDoc.eventId)}>
            {paidDoc.docNumber}
          </button>{' '}
          ({paidDoc.party}); Settle recorded it there.
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
          <Icon name="Document" size={14} /> QuickBooks {d.kind === 'bill' ? 'bill (we owe)' : 'invoice (owed to us)'}
        </span>
        <Status kind={DOC_STATUS[state].kind}>{DOC_STATUS[state].label}</Status>
      </header>
      <dl className="bill-rows">
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
            {state === 'overdue' && ` · ${daysOverdue(d.dueDate.toDate())} days overdue`}
          </dd>
        </div>
      </dl>
      <ol className="doc-trail">
        <li>
          {d.txnDate.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })} · {d.kind === 'bill' ? 'Bill received' : 'Invoice sent'}
        </li>
        {payments.map(p => {
          const bankId = p.reference.startsWith('event:') ? p.reference.slice(6) : '';
          const bank = bankId ? rowBy.get(bankId) : undefined;
          return (
            <li key={p.id.toString()}>
              {clock(p.paidAt.toDate())} · <Money value={dollars(p.amountMinor, d.currency)} /> {d.kind === 'bill' ? 'paid from the bank' : 'paid into the bank'}
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
        {!payments.length && <li className="muted">No payment yet</li>}
      </ol>
      {d.kind === 'invoice' && state !== 'paid' && <RemindButton d={d} />}
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
