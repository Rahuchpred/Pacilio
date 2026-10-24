// Settle's Money rule: tabular figures, a true minus sign, never mono.
// Amounts arrive in minor units; our inbound feed stores IDR as whole rupiah.
const MINOR_DIGITS: Record<string, number> = { IDR: 0, JPY: 0, KRW: 0 };

export function formatMoney(amountMinor: bigint, currency: string): string {
  const digits = MINOR_DIGITS[currency] ?? 2;
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const value = Number(abs) / 10 ** digits;
  const text = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${negative ? '−' : ''}${text}`;
}

export function Money({ amountMinor, currency }: { amountMinor: bigint; currency: string }) {
  return <span className="money">{formatMoney(amountMinor, currency)}</span>;
}
