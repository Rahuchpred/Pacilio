import { getJson, parseState, queryString, type Source } from '../types';

// Receipt documents from the CORD dataset (naver-clova-ix/cord-v2), replayed
// a few at a time. Receipts are Indonesian (IDR) and have no merchant or date.
// The train split is too large for the rows API, so we use validation + test.
const ROWS_URL = 'https://datasets-server.huggingface.co/rows';
const SPLITS = ['validation', 'test'];

type Field = string | string[] | undefined;
interface MenuItem { nm?: Field; cnt?: Field; price?: Field }
interface Total { total_price?: Field; cashprice?: Field; changeprice?: Field }
interface GroundTruth {
  gt_parse: {
    menu?: MenuItem | MenuItem[];
    sub_total?: { subtotal_price?: Field } | { subtotal_price?: Field }[];
    total?: Total | Total[];
  };
}
interface Row {
  row_idx: number;
  row: { image: { src: string }; ground_truth: string };
}

const first = (v: Field): string => (Array.isArray(v) ? v[0] : v) ?? '';

// "45,500" / "60.000" / "16,500.00" → whole rupiah
function parseRupiah(raw: string): bigint {
  const withoutDecimals = raw.replace(/[.,]\d{2}$/, '');
  const digits = withoutDecimals.replace(/\D/g, '');
  return BigInt(digits || '0');
}

const one = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

// Not every receipt labels its total; fall back the way a person would.
function receiptTotal(gt: GroundTruth['gt_parse'], menu: MenuItem[]): bigint {
  const total = one(gt.total);
  if (first(total?.total_price)) return parseRupiah(first(total?.total_price));
  const subtotal = first(one(gt.sub_total)?.subtotal_price);
  if (subtotal) return parseRupiah(subtotal);
  if (first(total?.cashprice) && first(total?.changeprice)) {
    return parseRupiah(first(total?.cashprice)) - parseRupiah(first(total?.changeprice));
  }
  return menu.reduce((sum, m) => sum + parseRupiah(first(m.price)), 0n);
}

export const cord: Source = {
  name: 'cord',
  requiredEnv: [],
  defaultMaxPerTick: 2,
  // OCR-style misreads, and the same receipt uploaded twice
  defaultProfile: { typoRate: 0.1, typoFields: ['description'], duplicateRate: 0.1 },

  poll(ctx, rawState, limit) {
    const state = parseState(rawState, { split: 0, offset: 0 });
    if (state.split >= SPLITS.length) return { events: [], state: rawState };

    const split = SPLITS[state.split];
    const params = queryString({
      dataset: 'naver-clova-ix/cord-v2',
      config: 'default',
      split,
      offset: state.offset,
      length: Math.min(limit, 100),
    });
    const res = getJson<{ rows: Row[] }>(ctx, `${ROWS_URL}?${params}`, {});

    const next = res.rows.length
      ? { split: state.split, offset: state.offset + res.rows.length }
      : { split: state.split + 1, offset: 0 };

    return {
      events: res.rows.map(({ row_idx, row }) => {
        const gt = (JSON.parse(row.ground_truth) as GroundTruth).gt_parse;
        const menu = Array.isArray(gt.menu) ? gt.menu : gt.menu ? [gt.menu] : [];
        const items = menu.map(m => `${first(m.nm)} x${first(m.cnt) || '1'}`).join(', ');
        return {
          sourceId: `${split}:${row_idx}`,
          kind: 'receipt' as const,
          occurredAt: ctx.now(),
          amountMinor: -receiptTotal(gt, menu),
          currency: 'IDR',
          counterparty: 'Unknown merchant',
          description: items || 'Receipt',
          documentUrl: row.image.src,
          raw: gt,
        };
      }),
      state: JSON.stringify(next),
    };
  },
};
