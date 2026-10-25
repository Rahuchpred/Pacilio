import { useState } from 'react';
import { useProcedure, useTable } from 'spacetimedb/react';
import { Button, Money, Status } from '../../../design-system/src/components';
import { procedures, tables } from '../module_bindings';
import { FarCard, Handles, type CardLevels } from '../canvas/levels';
import { Card, CardTabs } from './Card';
import { ROW_STATUS, SOURCE_TITLES, clock, dollars, kindLabel, openItem, totals, useRows, type Row } from './live';

// The master ledger: every event the agent has checked, with where it stands.
// Up close: every row, or the workbook exactly as Droid rendered it.

const SHORT_ROWS = 6;

function useLedger() {
  const rows = useRows().filter(r => r.state !== 'waiting' && r.state !== 'checking');
  const [docs] = useTable(tables.ledgerDocument);
  return { rows, t: totals(rows), doc: docs[0] };
}

function Far() {
  const { t } = useLedger();
  return (
    <FarCard
      type="ledger"
      width="w-ledger"
      icon="FileTable"
      word="Ledger"
      big={<Money value={t.net} />}
      line={`net · ${t.settled} posted${t.held ? `, ${t.held} held for you` : ''}`}
    />
  );
}

function RowCells({ r }: { r: Row }) {
  const s = ROW_STATUS[r.state];
  return (
    <>
      <span className="stack">
        <span className="strong">{r.event.counterparty}</span>
        <span className="muted small">{r.review?.category ?? kindLabel(r.event.kind)}</span>
      </span>
      {r.state === 'posted' ? (
        <span className="sheet-src">{SOURCE_TITLES[r.event.source] ?? r.event.source}</span>
      ) : (
        <Status kind={s.kind}>{s.label}</Status>
      )}
      <span className="num">
        <Money value={dollars(r.event.amountMinor, r.event.currency)} />
      </span>
    </>
  );
}

function Short() {
  const { rows, t, doc } = useLedger();
  const latest = rows.slice(-SHORT_ROWS).reverse();
  return (
    <div className="pnode-bare w-ledger">
      <h3 className="bare-title">
        Master ledger
        <span className="muted small">{doc ? `Updated ${clock(doc.updatedAt.toDate())}` : 'Not written yet'}</span>
      </h3>
      <div className="sheet">
        {latest.map(r => (
          <div key={r.event.id.toString()} className={`sheet-row${r.state === 'review' ? ' is-held' : ''}`}>
            <RowCells r={r} />
          </div>
        ))}
        {!latest.length && (
          <div className="sheet-row">
            <span className="muted">The agent writes rows after its first run.</span>
          </div>
        )}
        <div className="sheet-row sheet-total">
          <span>Net, {t.settled} posted</span>
          <span />
          <span className="num">
            <Money value={t.net} />
          </span>
        </div>
      </div>
      <Handles type="ledger" />
    </div>
  );
}

type Tab = 'rows' | 'workbook';

function Full() {
  const { rows, t, doc } = useLedger();
  const xlsxUrl = useProcedure(procedures.ledgerXlsxUrl);
  const [tab, setTab] = useState<Tab>('rows');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = () => {
    setBusy(true);
    setError(null);
    xlsxUrl()
      .then(url => window.open(url, '_blank', 'noopener'))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <Card
      type="ledger"
      icon="FileTable"
      title="Master ledger"
      className="w-ledger-full"
      meta={
        <Button kind="secondary" size="sm" icon="download" disabled={!doc} pending={busy} onClick={download}>
          Download .xlsx
        </Button>
      }
    >
      <dl className="counts">
        <div>
          <dt>Money in</dt>
          <dd>
            <Money value={t.moneyIn} />
          </dd>
        </div>
        <div>
          <dt>Money out</dt>
          <dd>
            <Money value={-t.moneyOut} />
          </dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>
            <Money value={t.net} />
          </dd>
        </div>
        <div>
          <dt>Held for you</dt>
          <dd>{t.held}</dd>
        </div>
      </dl>
      {error && <p className="card-error">{error}</p>}
      <CardTabs
        label="Ledger view"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'rows', label: `Rows (${rows.length})` },
          { id: 'workbook', label: 'Workbook' },
        ]}
      />
      {tab === 'rows' ? (
        <div className="sheet sheet-scroll nodrag nowheel">
          {[...rows].reverse().map(r => (
            <button
              type="button"
              key={r.event.id.toString()}
              className={`sheet-row sheet-button${r.state === 'review' ? ' is-held' : ''}`}
              onClick={() => openItem(r.event.id)}
            >
              <RowCells r={r} />
            </button>
          ))}
          {!rows.length && (
            <div className="sheet-row">
              <span className="muted">The agent writes rows after its first run.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="workbook nodrag nowheel">
          {doc ? (
            // Sandboxed: the agent's page can't run scripts or reach this app
            <iframe title="Master ledger workbook" sandbox="" srcDoc={doc.html} />
          ) : (
            <p className="muted">The agent writes the workbook after its first run.</p>
          )}
        </div>
      )}
      <p className="muted small">
        {doc ? `Written by the main agent at ${clock(doc.updatedAt.toDate())}. ` : ''}Totals count posted and refunded rows only.
      </p>
    </Card>
  );
}

export const ledger: CardLevels = { far: Far, short: Short, full: Full };
