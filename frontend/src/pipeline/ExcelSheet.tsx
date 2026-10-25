import { useEffect, useMemo, useRef, useState } from 'react';
import { ROW_STATUS, SOURCE_TITLES, dollars, kindLabel, openItem, type Row, type RowState } from './live';
import './excel.css';

// The master ledger as a spreadsheet, the way Excel draws it: a formula bar,
// column letters and row numbers, fills by status, sheet tabs and the green
// status bar. Live from the same rows as the agent's workbook. Click a cell to
// select it (the bar shows its value or formula); double-click a row, or press
// Enter, to look at that event closely. New rows flash, then settle.

type Cell = string;
type SheetRow = { cells: Cell[]; tone?: string; eventId?: bigint; fresh?: boolean; total?: boolean };
type Sheet = { id: string; label: string; headers: string[]; widths: number[]; num: number[]; rows: SheetRow[]; formula: (r: number, c: number) => string | null };

const STATUS_TEXT: Partial<Record<RowState, string>> = {
  posted: '✓ OK',
  voided: '✕ Void',
  review: '! Review',
  refunded: '↺ Refunded',
  following_up: '✉ Following up',
};
const TONE: Partial<Record<RowState, string>> = {
  voided: 'void',
  review: 'review',
  refunded: 'refunded',
  following_up: 'following_up',
};
const SETTLED_OR_HELD = (s: RowState) => s !== 'voided';

const money = (v: number) => {
  const text = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? '−' + text : text;
};
const parseMoney = (s: string): number | null => {
  const m = s.replace(/[$,]/g, '').replace('−', '-').match(/^-?\d+(\.\d+)?$/);
  return m ? Number(m[0]) : null;
};
export const letter = (n: number) => {
  let out = '';
  while (n) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};
const date = (d: Date) => d.toISOString().slice(0, 10);

const LEDGER_HEADERS = ['#', 'Date', 'Source', 'Counterparty', 'Description', 'Category', 'Amount', 'Status', 'Note'];
const LEDGER_WIDTHS = [44, 92, 74, 180, 230, 190, 104, 110, 300];
const AMOUNT_COL = 6;

function ledgerCells(r: Row, n: number): Cell[] {
  return [
    String(n),
    date(r.event.occurredAt.toDate()),
    SOURCE_TITLES[r.event.source] ?? r.event.source,
    r.event.counterparty,
    r.event.description,
    r.review?.category ?? kindLabel(r.event.kind),
    money(dollars(r.event.amountMinor, r.event.currency)),
    STATUS_TEXT[r.state] ?? ROW_STATUS[r.state].label,
    r.review?.note ?? '',
  ];
}

function buildSheets(rows: Row[], fresh: Set<string>): Sheet[] {
  const counted = rows.filter(r => SETTLED_OR_HELD(r.state));
  const amount = (r: Row) => dollars(r.event.amountMinor, r.event.currency);
  const moneyIn = counted.reduce((t, r) => t + Math.max(0, amount(r)), 0);
  const moneyOut = counted.reduce((t, r) => t + Math.min(0, amount(r)), 0);
  const last = rows.length + 1;

  const ledgerRows: SheetRow[] = rows.map((r, i) => ({
    cells: ledgerCells(r, i + 1),
    tone: TONE[r.state],
    eventId: r.event.id,
    fresh: fresh.has(r.event.id.toString()),
  }));
  ledgerRows.push({ cells: Array(9).fill(''), total: false });
  ledgerRows.push({
    cells: ['', '', '', 'Total', '', `In ${money(moneyIn)} · Out ${money(moneyOut)}`, money(moneyIn + moneyOut), '', ''],
    total: true,
  });

  const review = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => r.state === 'review');
  const reviewRows: SheetRow[] = review.map(({ r, n }) => ({
    cells: [...ledgerCells(r, n), (r.item?.recommendation ?? '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())],
    tone: 'review',
    eventId: r.event.id,
  }));

  const byCat = new Map<string, { n: number; inc: number; out: number }>();
  for (const r of counted) {
    const key = r.review?.category ?? 'Other';
    const c = byCat.get(key) ?? { n: 0, inc: 0, out: 0 };
    c.n++;
    const v = amount(r);
    if (v >= 0) c.inc += v;
    else c.out += v;
    byCat.set(key, c);
  }
  const cats = [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b));
  const summaryRows: SheetRow[] = cats.map(([cat, c]) => ({ cells: [cat, String(c.n), money(c.inc), money(c.out), money(c.inc + c.out)] }));
  summaryRows.push({
    cells: ['Total', String(cats.reduce((t, [, c]) => t + c.n, 0)), money(moneyIn), money(moneyOut), money(moneyIn + moneyOut)],
    total: true,
  });

  return [
    {
      id: 'ledger',
      label: 'Ledger',
      headers: LEDGER_HEADERS,
      widths: LEDGER_WIDTHS,
      num: [AMOUNT_COL],
      rows: ledgerRows,
      formula: (r, c) => (r === ledgerRows.length - 1 && c === AMOUNT_COL ? `=SUM(G2:G${last})` : null),
    },
    {
      id: 'review',
      label: `Needs review (${review.length})`,
      headers: [...LEDGER_HEADERS, 'Recommended action'],
      widths: [...LEDGER_WIDTHS, 150],
      num: [AMOUNT_COL],
      rows: reviewRows,
      formula: () => null,
    },
    {
      id: 'summary',
      label: 'Summary',
      headers: ['Category', 'Rows', 'Money in', 'Money out', 'Net'],
      widths: [220, 70, 120, 120, 120],
      num: [1, 2, 3, 4],
      rows: summaryRows,
      formula: (r, c) => {
        const row = r + 2;
        if (r === summaryRows.length - 1) return c === 0 ? null : `=SUM(${letter(c + 1)}2:${letter(c + 1)}${row - 1})`;
        if (c === 1) return `=COUNTIF(Ledger!F:F,A${row})`;
        if (c === 2) return `=SUMIFS(Ledger!G:G,Ledger!F:F,A${row},Ledger!G:G,">0")`;
        if (c === 3) return `=SUMIFS(Ledger!G:G,Ledger!F:F,A${row},Ledger!G:G,"<0")`;
        if (c === 4) return `=C${row}+D${row}`;
        return null;
      },
    },
  ];
}

// Rows that appeared since the sheet was last drawn flash for a moment.
const FLASH_MS = 1600;
function useFresh(rows: Row[]): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = rows.map(r => `${r.event.id}:${r.state}`).join(',');
  useEffect(() => {
    const now = new Set(rows.map(r => `${r.event.id}:${r.state}`));
    if (!seen.current) {
      seen.current = now;
      return;
    }
    const changed = rows.filter(r => !seen.current!.has(`${r.event.id}:${r.state}`)).map(r => r.event.id.toString());
    seen.current = now;
    if (!changed.length) return;
    setFresh(new Set(changed));
    const t = window.setTimeout(() => setFresh(new Set()), FLASH_MS);
    return () => window.clearTimeout(t);
    // key captures the rows' ids and states
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return fresh;
}

type Selection = { r: number; c: number } | { col: number } | null;

export function ExcelSheet({ rows }: { rows: Row[] }) {
  const fresh = useFresh(rows);
  const sheets = useMemo(() => buildSheets(rows, fresh), [rows, fresh]);
  const [tab, setTab] = useState('ledger');
  const [sel, setSel] = useState<Selection>(null);
  const grid = useRef<HTMLDivElement>(null);
  const sheet = sheets.find(s => s.id === tab) ?? sheets[0];

  // The bar's name box and contents, and the status bar's count and sum
  let name = 'A1';
  let content = sheet.headers[0];
  let count = sheet.rows.filter(r => !r.total && r.cells.some(Boolean)).length;
  let sum: number | null = null;
  // Money cells sum as money, counts as plain numbers, like Excel's formats
  let sumIsMoney = true;
  if (sel && 'col' in sel) {
    name = `${letter(sel.col + 1)}:${letter(sel.col + 1)}`;
    const values = sheet.rows.filter(r => !r.total).map(r => r.cells[sel.col]).filter(Boolean);
    content = '';
    count = values.length;
    const nums = values.map(parseMoney).filter((v): v is number => v !== null);
    sum = nums.length ? nums.reduce((t, v) => t + v, 0) : null;
    sumIsMoney = values.some(v => v.includes('$'));
  } else if (sel) {
    const cell = sheet.rows[sel.r]?.cells[sel.c] ?? '';
    name = `${letter(sel.c + 1)}${sel.r + 2}`;
    content = sheet.formula(sel.r, sel.c) ?? cell;
    count = cell ? 1 : 0;
    sum = parseMoney(cell);
    sumIsMoney = cell.includes('$');
  } else if (sheet.id === 'ledger') {
    const total = sheet.rows[sheet.rows.length - 1];
    sum = parseMoney(total.cells[AMOUNT_COL]);
  }

  const look = (r: SheetRow | undefined) => {
    if (r?.eventId !== undefined) openItem(r.eventId);
  };

  // Arrow keys move the selection; Enter opens the selected row's event
  const onKey = (e: React.KeyboardEvent) => {
    if (!sel || 'col' in sel) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      const r = Math.max(0, Math.min(sheet.rows.length - 1, sel.r + m[0]));
      const c = Math.max(0, Math.min(sheet.headers.length - 1, sel.c + m[1]));
      setSel({ r, c });
      grid.current?.querySelector(`[data-cell="${r}-${c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (e.key === 'Enter') {
      look(sheet.rows[sel.r]);
    }
  };

  const selRow = sel && !('col' in sel) ? sel.r : -1;
  const selCol = sel ? ('col' in sel ? sel.col : sel.c) : -1;

  return (
    <div className="xl nodrag nowheel" onKeyDown={onKey}>
      <div className="xl-fx">
        <div className="xl-name">{name}</div>
        <div className="xl-f">fx</div>
        <div className="xl-formula" title={content}>
          {content}
        </div>
      </div>
      <div className="xl-grid" ref={grid} tabIndex={0}>
        <table style={{ width: 40 + sheet.widths.reduce((t, w) => t + w, 0) }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {sheet.widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="xl-corner xl-rn" onClick={() => setSel(null)} />
              {sheet.headers.map((_, i) => (
                <th key={i} className={selCol === i ? 'is-on' : ''} onClick={() => setSel({ col: i })}>
                  {letter(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="xl-hdr">
              <th className="xl-rn">1</th>
              {sheet.headers.map((h, i) => (
                <td key={i} className={`${sheet.num.includes(i) ? 'num ' : ''}${selCol === i && 'col' in (sel ?? {}) ? 'is-col' : ''}`}>
                  {h}
                </td>
              ))}
            </tr>
            {sheet.rows.map((row, r) => (
              <tr
                key={row.eventId?.toString() ?? `x${r}`}
                className={`${row.tone ? 'is-' + row.tone : ''}${row.total ? ' is-total' : ''}${row.fresh ? ' is-fresh' : ''}`}
                onDoubleClick={() => look(row)}
              >
                <th className={`xl-rn${selRow === r ? ' is-on' : ''}`}>{r + 2}</th>
                {row.cells.map((v, c) => (
                  <td
                    key={c}
                    data-cell={`${r}-${c}`}
                    title={v}
                    className={[
                      sheet.num.includes(c) ? 'num' : '',
                      selRow === r && selCol === c ? 'is-sel' : '',
                      sel && 'col' in sel && sel.col === c ? 'is-col' : '',
                    ].join(' ')}
                    onClick={() => setSel({ r, c })}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
            {sheet.rows.length === 0 && (
              <tr>
                <th className="xl-rn">2</th>
                <td colSpan={sheet.headers.length} className="xl-empty">
                  {sheet.id === 'review' ? 'Nothing needs review.' : 'The agent writes rows after its first run.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="xl-tabs" role="tablist" aria-label="Sheets">
        {sheets.map(s => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sheet.id}
            onClick={() => {
              setTab(s.id);
              setSel(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="xl-status">
        <span>Ready{sheet.id !== 'summary' ? ' · double-click a row to look closer' : ''}</span>
        <span>
          <span>Count: {count}</span>
          {sum !== null && <span>Sum: {sumIsMoney ? money(sum) : sum.toLocaleString('en-US')}</span>}
        </span>
      </div>
    </div>
  );
}
