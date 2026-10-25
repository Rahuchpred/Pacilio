// Raw feeds shout or whisper ("STRIPE PAYOUT", "stage sponsorship - oct 24
// show"); show them in sentence case.
export function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const lower = t === t.toUpperCase() || t === t.toLowerCase() ? t.toLowerCase() : t;
  const months = lower.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/g, m => m[0].toUpperCase() + m.slice(1));
  return months.charAt(0).toUpperCase() + months.slice(1);
}
