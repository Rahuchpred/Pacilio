// Moves cards aside when one opens in full. Pure: the same base positions,
// sizes and open cards give the same layout on every screen.
//
// An open card pushes whatever it now covers to its right (things that sat
// to its right) or down (everything else). A pushed card takes its row or
// column along, so lines of cards stay lined up, and anything it lands on is
// pushed the same way in turn.

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
type Rect = { x: number; y: number; w: number; h: number };

// Room kept around an open card; cards the cascade moves only need to clear
// each other, so cards that sat close together stay as close
const GAP = 60;
const NUDGE_GAP = 40;
// Cards whose base x (or y) is this close count as one column (or row)
const ALIGN = 8;
const MAX_PASSES = 40;

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function arrange(
  base: Record<string, Point>,
  size: (id: string) => Size,
  overview: (id: string) => Size,
  open: string[],
  pinned?: string
): Record<string, Point> {
  const ids = Object.keys(base);
  const pos: Record<string, Point> = Object.fromEntries(ids.map(id => [id, { ...base[id] }]));
  const rect = (id: string): Rect => ({ ...pos[id], w: size(id).width, h: size(id).height });
  // Which way a card moves when another lands on it, judged from where both
  // sat before anything opened
  const direction = (mover: string, by: string): 'right' | 'down' => {
    const m = base[mover];
    const b = base[by];
    const bw = overview(by).width;
    return m.x >= b.x + bw - ALIGN || (m.x > b.x && m.y < b.y + overview(by).height) ? 'right' : 'down';
  };
  const push = (id: string, dir: 'right' | 'down', amount: number) => {
    const key = dir === 'right' ? 'x' : 'y';
    // The pushed card's whole column (pushed right) or row (pushed down)
    const across = dir === 'right' ? 'x' : 'y';
    for (const other of ids) {
      if (other === pinned) continue;
      if (other === id || Math.abs(base[other][across] - base[id][across]) <= ALIGN) {
        pos[other][key] += amount;
        moved.add(other);
      }
    }
  };

  const moved = new Set<string>();
  const order = [...open].filter(id => base[id]).sort((a, b) => base[a].y - base[b].y || base[a].x - base[b].x);
  for (const id of order) moved.add(id);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const a of ids) {
      if (!moved.has(a)) continue;
      const ra = rect(a);
      for (const b of ids) {
        if (a === b || b === pinned) continue;
        const rb = rect(b);
        const gap = open.includes(a) || open.includes(b) ? GAP : NUDGE_GAP;
        if (!overlaps(ra, rb, gap)) continue;
        // Only the card that sat further along moves
        const dir = direction(b, a);
        if (dir === 'right' && base[b].x < base[a].x) continue;
        if (dir === 'down' && base[b].y < base[a].y) continue;
        const amount = dir === 'right' ? ra.x + ra.w + gap - rb.x : ra.y + ra.h + gap - rb.y;
        if (amount <= 0) continue;
        push(b, dir, amount);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return pos;
}
