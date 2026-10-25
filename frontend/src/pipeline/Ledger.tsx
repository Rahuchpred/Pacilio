import { useState } from 'react';
import { useProcedure, useTable } from 'spacetimedb/react';
import { Button, Money } from '../../../design-system/src/components';
import { procedures, tables } from '../module_bindings';
import { FarCard, type CardLevels } from '../canvas/levels';
import { Card } from './Card';
import { ExcelSheet } from './ExcelSheet';
import { clock, totals, useRows } from './live';

// The master ledger: every event the agent has checked, with where it stands.
// Open, it is a live spreadsheet with the same sheets as the agent's workbook.

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

function Full() {
  const { rows, t, doc } = useLedger();
  const xlsxUrl = useProcedure(procedures.ledgerXlsxUrl);
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
      title="Master ledger.xlsx"
      className="w-ledger-full"
      meta={
        <>
          <span className="muted small">{doc ? `Updated ${clock(doc.updatedAt.toDate())}` : 'Not written yet'}</span>
          <Button kind="secondary" size="sm" icon="download" disabled={!doc} pending={busy} onClick={download}>
            Download .xlsx
          </Button>
        </>
      }
    >
      {error && <p className="card-error">{error}</p>}
      <ExcelSheet rows={rows} />
      <p className="muted small">
        Net <Money value={t.net} /> from {t.settled} posted and refunded rows; {t.held} held for you. The .xlsx is the agent's
        workbook, with the same sheets.
      </p>
    </Card>
  );
}

export const ledger: CardLevels = { far: Far, full: Full };
