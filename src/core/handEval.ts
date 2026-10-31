import { Card, rankOf, suitOf, RANK_CHARS } from './cards';

/**
 * Hand evaluation. Returns a numeric score: higher is better. Score encodes
 * category (0..8) * 16^5 + up to 5 kicker ranks. Works for 5..7 cards.
 */
export const CATEGORY_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];
const B = 16;
const P5 = B ** 5;

function enc(cat: number, ranks: number[]): number {
  let v = cat * P5;
  let m = B ** 4;
  for (let i = 0; i < 5; i++) { v += (ranks[i] ?? 0) * m; m /= B; }
  return v;
}

/** Highest straight top rank in a 13-bit rank mask, or -1. Wheel = 3 (5-high). */
function straightTop(mask: number): number {
  for (let top = 12; top >= 4; top--) {
    const need = 0b11111 << (top - 4);
    if ((mask & need) === need) return top;
  }
  // wheel A-2-3-4-5
  if ((mask & 0b1000000001111) === 0b1000000001111) return 3;
  return -1;
}

export function evaluate(cards: readonly Card[]): number {
  const rc = new Array(13).fill(0);
  const sc = [0, 0, 0, 0];
  const smask = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = rankOf(c), s = suitOf(c);
    rc[r]++; sc[s]++; smask[s] |= 1 << r; mask |= 1 << r;
  }
  // flush / straight flush
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightTop(smask[flushSuit]);
    if (sf >= 0) return enc(8, [sf]);
  }
  const quads: number[] = [], trips: number[] = [], pairs: number[] = [], singles: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quads.push(r);
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
    else if (rc[r] === 1) singles.push(r);
  }
  if (quads.length) {
    const q = quads[0];
    let k = -1;
    for (let r = 12; r >= 0; r--) if (r !== q && rc[r] > 0) { k = r; break; }
    return enc(7, [q, k]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1);
    return enc(6, [t, p]);
  }
  if (flushSuit >= 0) {
    const fr: number[] = [];
    for (let r = 12; r >= 0 && fr.length < 5; r--) if (smask[flushSuit] & (1 << r)) fr.push(r);
    return enc(5, fr);
  }
  const st = straightTop(mask);
  if (st >= 0) return enc(4, [st]);
  if (trips.length) {
    const t = trips[0];
    const ks: number[] = [];
    for (let r = 12; r >= 0 && ks.length < 2; r--) if (r !== t && rc[r] > 0) ks.push(r);
    return enc(3, [t, ...ks]);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    let k = -1;
    for (let r = 12; r >= 0; r--) if (r !== p1 && r !== p2 && rc[r] > 0) { k = r; break; }
    return enc(2, [p1, p2, k]);
  }
  if (pairs.length === 1) {
    const p = pairs[0];
    const ks: number[] = [];
    for (let r = 12; r >= 0 && ks.length < 3; r--) if (r !== p && rc[r] > 0) ks.push(r);
    return enc(1, [p, ...ks]);
  }
  return enc(0, singles.slice(0, 5));
}

export function categoryOf(score: number): number { return Math.floor(score / P5); }
export function describe(score: number): string {
  const cat = categoryOf(score);
  const top = Math.floor((score % P5) / B ** 4);
  const name = CATEGORY_NAMES[cat];
  const rn = (r: number) => RANK_CHARS[r] === 'T' ? '10' : RANK_CHARS[r];
  if (cat === 8 && top === 12) return 'Royal Flush';
  if (cat === 0 || cat === 5) return `${name}, ${rn(top)} high`;
  if (cat === 4 || cat === 8) return `${name}, ${rn(top)} high`;
  return `${name}, ${rn(top)}s`;
}
