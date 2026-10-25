import { useState } from 'react';
import type { ReportChart } from '../module_bindings/types';
import { useLive } from './store';

// Charts the team asked the reports agent for. The agent sends the numbers
// (label, value); they're drawn here in the report's style, so a request can
// add a chart without the agent writing any page code. Every report build
// refreshes them.

type Point = { label: string; value: number };

// The report's data colors: slot 1 blue for the series, slot 2 orange for
// negatives (the validated pair the show report uses)
const SERIES = '#2a78d6';
const NEGATIVE = '#eb6834';

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function format(v: number, unit: string): string {
  const text = WHOLE.format(Math.abs(Math.round(v)));
  const sign = v < 0 ? '−' : '';
  return unit === 'usd' ? `${sign}$${text}` : `${sign}${text}`;
}

function points(c: ReportChart): Point[] {
  try {
    const rows = JSON.parse(c.rows);
    return Array.isArray(rows) ? rows.filter((r): r is Point => typeof r?.label === 'string' && typeof r?.value === 'number') : [];
  } catch {
    return [];
  }
}

function Bars({ rows, unit }: { rows: Point[]; unit: string }) {
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 1);
  return (
    <div className="tc-bars" role="img" aria-label="Bar chart">
      {rows.map(r => (
        <div key={r.label} className="tc-bar-row" title={`${r.label}: ${format(r.value, unit)}`}>
          <span className="tc-label">{r.label}</span>
          <span className="tc-track">
            <span
              className="tc-bar"
              style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.value < 0 ? NEGATIVE : SERIES }}
            />
          </span>
          <span className="tc-value">{format(r.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}

const W = 640;
const H = 200;
const PAD = { top: 16, right: 64, bottom: 28, left: 8 };

function Line({ rows, unit }: { rows: Point[]; unit: string }) {
  const values = rows.map(r => r.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, lo + 1);
  const x = (i: number) => PAD.left + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.value).toFixed(1)}`).join(' ');
  const last = rows[rows.length - 1];
  // Label the ends and the middle; every point has a hover title
  const ticks = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  return (
    <svg className="tc-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart">
      <line x1={PAD.left} x2={W - PAD.right} y1={y(lo)} y2={y(lo)} className="tc-axis" />
      <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((r, i) => (
        <circle key={i} cx={x(i)} cy={y(r.value)} r={i === rows.length - 1 ? 4 : 3} fill={SERIES} stroke="#fff" strokeWidth={2}>
          <title>{`${r.label}: ${format(r.value, unit)}`}</title>
        </circle>
      ))}
      <text x={x(rows.length - 1) + 8} y={y(last.value) + 4} className="tc-end">
        {format(last.value, unit)}
      </text>
      {ticks.map(i => (
        <text key={i} x={x(i)} y={H - 8} className="tc-tick" textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}>
          {rows[i].label}
        </text>
      ))}
    </svg>
  );
}

function Table({ rows, unit }: { rows: Point[]; unit: string }) {
  return (
    <table className="tc-table">
      <tbody>
        {rows.map(r => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="num">{format(r.value, unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TeamChart({ chart }: { chart: ReportChart }) {
  const [asTable, setAsTable] = useState(false);
  const rows = points(chart);
  if (!rows.length) return null;
  const kind = asTable ? 'table' : chart.kind;
  return (
    <figure className="tc">
      <figcaption>
        <span className="strong">{chart.title}</span>
        <span className="muted small" title={chart.request}>
          Asked for through Pacioli
        </span>
      </figcaption>
      {kind === 'line' ? <Line rows={rows} unit={chart.unit} /> : kind === 'table' ? <Table rows={rows} unit={chart.unit} /> : <Bars rows={rows} unit={chart.unit} />}
      {chart.kind !== 'table' && (
        <button type="button" className="link-button nodrag" onClick={() => setAsTable(t => !t)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      )}
    </figure>
  );
}

export function TeamCharts() {
  const charts = useLive().reportCharts;
  if (!charts.length) return null;
  return (
    <div className="tc-grid">
      {[...charts]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map(c => (
          <TeamChart key={c.id.toString()} chart={c} />
        ))}
    </div>
  );
}
