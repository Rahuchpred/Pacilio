// Evidence lines read "Row 5 · Ledger · +$4,687.00 · Oct 25, 2026 · INV-2497".
// Shown as a small table: the row, its source, what it is, the amount.
export function Evidence({ lines }: { lines: string[] }) {
  return (
    <table className="bill-evidence">
      <tbody>
        {lines.map(line => {
          const parts = line.split(' \u00b7 ').map(p => p.trim());
          const amountAt = parts.findIndex(p => /^[+\u2212-]?\$/.test(p));
          if (parts.length < 3 || amountAt < 0) {
            return (
              <tr key={line}>
                <td colSpan={3}>{line}</td>
              </tr>
            );
          }
          const amount = parts[amountAt];
          const rest = parts.filter((_, i) => i !== amountAt);
          const [ref, source, ...detail] = rest;
          return (
            <tr key={line}>
              <td className="bill-ev-ref">
                <span className="strong">{ref}</span>
                <span className="muted small">{source}</span>
              </td>
              <td className="bill-ev-detail muted small">{detail.join(' \u00b7 ')}</td>
              <td className="bill-ev-amount">{amount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
