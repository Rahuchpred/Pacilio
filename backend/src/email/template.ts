// HTML version of the emails we send, set as a statement: centered, the
// amount first, the line items as a summary, ink with one orange line across
// the top. Email clients ignore <style> and CSS variables, so every style is
// inline and the layout is tables; the orange gradient sits on a solid
// bgcolor for Outlook. Colors mirror design-system/src/tokens/tokens.json and
// the orange accent in tokens.css.

const SANS = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SENDER = 'Pacioli Bookkeeping';

export interface Detail {
  label: string;
  value: string;
  tone?: 'in' | 'out';
}

export interface EmailContent {
  // Hidden line most inboxes show next to the subject
  preheader: string;
  // e.g. SET-0042, shown in the header so they can quote it back
  reference: string;
  title?: string;
  details?: Detail[];
  // The amount in question, set large at the top
  amount?: string;
  // e.g. Oct 25, 2026
  sentOn?: string;
  // Plain text: blank lines split paragraphs
  message: string;
  replyTo: string;
}

export function reference(reviewItemId: bigint): string {
  return `SET-${reviewItemId.toString().padStart(4, '0')}`;
}

// $1,250.00, with a true minus for money out. Done by hand because the module
// runtime has no Intl.
export function money(amountMinor: bigint, currency: string): string {
  const neg = amountMinor < 0n;
  const abs = neg ? -amountMinor : amountMinor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100n).toString().padStart(2, '0');
  const symbol = currency.toUpperCase() === 'USD' ? '$' : `${currency.toUpperCase()} `;
  return `${neg ? '−' : ''}${symbol}${whole}.${cents}`;
}

export function shortDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const C = {
  page: '#f0f0f3', // ink.100
  card: '#ffffff', // ink.0
  surface: '#f7f7f9', // ink.50
  border: '#e3e3e8', // ink.200
  primary: '#0b0b0f', // ink.1000
  secondary: '#55555f', // ink.600
  tertiary: '#74747e', // ink.500
  in: '#1d7a4a', // green.600
};

// The orange accent's fill, as on the decide button
const ORANGE_FILL = 'linear-gradient(180deg, #ff9a52 0%, #ff7019 55%, #f0600a 100%)';

function p(text: string, color: string, size = 15, line = 22): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map(
      para =>
        `<p style="margin:0 0 16px;font-family:${SANS};font-size:${size}px;line-height:${line}px;color:${color};">${esc(para.trim()).replace(/\n/g, '<br>')}</p>`
    )
    .join('');
}

function table(inner: string, style = ''): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;${style}">${inner}</table>`;
}

function detailRows(details: Detail[]): string {
  const top = `border-top:1px solid ${C.border};`;
  const pad = '10px 0';
  const rows = details
    .map(d => {
      const color = d.tone === 'in' ? C.in : C.primary;
      // One font for everything: the reference and ids too
      const font = `${SANS};font-size:14px`;
      return `<tr>
  <td style="${top}padding:${pad};font-family:${SANS};font-size:13px;line-height:18px;color:${C.secondary};width:42%;" valign="top">${esc(d.label)}</td>
  <td style="${top}padding:${pad};font-family:${font};line-height:18px;color:${color};font-weight:500;text-align:right;font-variant-numeric:tabular-nums;" valign="top">${esc(d.value)}</td>
</tr>`;
    })
    .join('');
  return table(rows, 'margin:0 0 24px;');
}

function mark(): string {
  return `<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:0;background:${C.primary};color:${C.card};text-align:center;font-family:${SANS};font-size:13px;font-weight:600;vertical-align:middle;">P</span>`;
}

function shell(c: EmailContent, inner: string): string {
  const page = C.page;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(c.title ?? SENDER)}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${page};font-family:${SANS};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-family:${SANS};color:${page};">${esc(c.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${page}" style="background:${page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
${inner}
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderEmail(c: EmailContent): string {
  const k = C;
  const head = `<p style="margin:0 0 20px;font-family:${SANS};font-size:15px;line-height:22px;color:${k.primary};text-align:center;">${mark()}<span style="font-weight:500;vertical-align:middle;margin-left:8px;">Pacioli</span></p>`;
  const amount = c.amount
    ? `<p style="margin:0;font-family:${SANS};font-size:44px;line-height:48px;font-weight:300;letter-spacing:-0.02em;color:${k.primary};text-align:center;font-variant-numeric:tabular-nums;">${esc(c.amount)}</p>`
    : '';
  const title = c.title
    ? `<p style="margin:10px 0 4px;font-family:${SANS};font-size:15px;line-height:22px;color:${k.primary};text-align:center;">${esc(c.title)}</p>`
    : '';
  const meta = `<p style="margin:0 0 28px;font-family:${SANS};font-size:13px;line-height:18px;color:${k.tertiary};text-align:center;">${c.sentOn ? `${esc(c.sentOn)} &middot; ` : ''}<span>${esc(c.reference)}</span></p>`;
  const summary = c.details?.length
    ? `<p style="margin:0 0 4px;font-family:${SANS};font-size:11px;line-height:16px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:${k.tertiary};">Summary</p>${detailRows(c.details)}`
    : '';
  return shell(
    c,
    `<tr><td bgcolor="${k.card}" style="background:${k.card};border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 8px 24px -8px rgba(0,0,0,0.10);">
  ${table(`<tr><td height="4" bgcolor="#ff7019" style="background:${ORANGE_FILL};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:32px 36px 36px;">
    ${head}${amount}${title}${meta}${summary}
    ${table(`<tr><td bgcolor="${k.surface}" style="background:${k.surface};border-radius:10px;padding:20px 20px 4px;">${p(c.message, k.primary, 14, 21)}</td></tr>`)}
  </td></tr>`)}
</td></tr>`
  );
}

