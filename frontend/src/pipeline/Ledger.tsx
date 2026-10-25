import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProcedure, useReducer } from 'spacetimedb/react';
import { Button, Icon, Money } from '../../../design-system/src/components';
import { procedures, reducers } from '../module_bindings';
import { FarCard, type CardLevels } from '../canvas/levels';
import { Card } from './Card';
import { ExcelSheet } from './ExcelSheet';
import { clock, totals } from './live';
import { useLive } from './store';

// The master ledger: every event the agent has checked, with where it stands.
// Open, it is a live spreadsheet with the same sheets as the agent's workbook.

function useLedger() {
  const { rows: all, ledgerDocs } = useLive();
  const rows = useMemo(() => all.filter(r => r.state !== 'waiting' && r.state !== 'checking'), [all]);
  const t = useMemo(() => totals(rows), [rows]);
  return { rows, t, doc: ledgerDocs[0] };
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

// The workbook is built between Bookkeeper runs, not after every one. When
// the last build is current this downloads it; otherwise it asks for a build
// and turns into Download when it's ready (for everyone).
function XlsxButton() {
  const { ledgerRenders, ledgerDocs } = useLive();
  const xlsxUrl = useProcedure(procedures.ledgerXlsxUrl);
  const build = useReducer(reducers.requestLedgerRender);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const render = ledgerRenders[0];
  const doc = ledgerDocs[0];
  const fresh = !!render?.sessionId && !!doc && render.renderedRunId === doc.runId;
  const building = render?.status === 'running' || !!render?.requested;

  const act = () => {
    setBusy(true);
    setError(null);
    const done = () => setBusy(false);
    if (fresh) {
      xlsxUrl()
        .then(url => window.open(url, '_blank', 'noopener'))
        .catch((err: Error) => setError(err.message))
        .finally(done);
    } else {
      build()
        .catch((err: Error) => setError(err.message))
        .finally(done);
    }
  };

  return (
    <span className="xlsx-button" title={error ?? (fresh ? 'Download the workbook' : 'Build the workbook from the latest ledger')}>
      <Button kind="secondary" size="sm" icon="download" disabled={!doc || building} pending={busy || building} onClick={act}>
        {building ? 'Building .xlsx…' : fresh ? 'Download .xlsx' : 'Build .xlsx'}
      </Button>
      {error && <span className="card-error small">{error}</span>}
    </span>
  );
}

// The whole sheet over the canvas, so every column and row has room. Esc or
// Close returns.
function SheetViewer({ onClose }: { onClose: () => void }) {
  const { rows, t, doc } = useLedger();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer" role="dialog" aria-label="Master ledger" onClick={e => e.stopPropagation()}>
        <header className="viewer-head">
          <span className="viewer-title">
            <Icon name="FileTable" /> Master ledger.xlsx
            <span className="muted small">
              {doc ? `Updated ${clock(doc.updatedAt.toDate())} · ` : ''}net <Money value={t.net} />, {t.settled} posted, {t.held} held for you
            </span>
          </span>
          <span className="viewer-actions">
            <XlsxButton />
            <Button kind="quiet" size="sm" icon="Close" onClick={onClose}>
              Close
            </Button>
          </span>
        </header>
        <div className="viewer-sheet">
          <ExcelSheet rows={rows} />
        </div>
      </div>
    </div>,
    document.body
  );
}

function Full() {
  const { rows, t, doc } = useLedger();
  const [viewing, setViewing] = useState(false);

  return (
    <Card
      type="ledger"
      icon="FileTable"
      title="Master ledger.xlsx"
      className="w-ledger-full"
      meta={
        <>
          <span className="muted small">{doc ? `Updated ${clock(doc.updatedAt.toDate())}` : 'Not written yet'}</span>
          <Button kind="secondary" size="sm" icon="ExpandAll" onClick={() => setViewing(true)}>
            Full screen
          </Button>
          <XlsxButton />
        </>
      }
    >
      <ExcelSheet rows={rows} />
      <p className="muted small">
        Net <Money value={t.net} /> from {t.settled} posted and refunded rows; {t.held} held for you. The .xlsx has the same
        sheets; it's built from the latest ledger when you ask for it.
      </p>
      {viewing && <SheetViewer onClose={() => setViewing(false)} />}
    </Card>
  );
}

export const ledger: CardLevels = { far: Far, full: Full };
